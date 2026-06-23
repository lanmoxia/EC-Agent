"use strict";
/**
 * Stop 钩子：把本轮最终回复的活状态锚点 + 工作树脏文件，写进 PROGRESS.md，
 * 并单独 commit + push（只动 PROGRESS.md），让另一台机器实时看到"当前做到哪、哪些文件没存"。
 * 由 progress-writer.sh 用 node 绝对路径调用（双机定位 node）。
 *
 * 设计原则（与 anchor-check.js 一致）：
 * - fail-open：任何异常都静默 exit 0，绝不卡用户、绝不输出 {decision:block}（写盘钩子不参与校验）。
 * - 与 anchor-check 解耦：本钩子只读锚点、不校验、不打回；校验仍归 anchor-check.js。
 * - 省噪音：PROGRESS.md 实质内容没变（忽略时间戳）就跳过 commit/push。
 * - 写时序守卫：刚结束的回复可能没落盘，首行不是 ANCHOR 就 sleep 重读一次。
 *
 * 测试开关：环境变量 PROGRESS_WRITER_DRYRUN=1 → 只把将写入的内容打到 stdout，不写文件、不 git。
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

let input = {};
try { input = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch { input = {}; }
const transcriptPath = input.transcript_path || "";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const PROGRESS = path.join(PROJECT_DIR, "PROGRESS.md");
const DRYRUN = !!process.env.PROGRESS_WRITER_DRYRUN;

function done() { process.exit(0); }
function sleep(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* noop */ } }
function git(args) {
  try { return execSync("git " + args, { cwd: PROJECT_DIR, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
}

// —— transcript 解析（与 anchor-check.js 同款）——
function readEntries() {
  let txt = "";
  try { txt = fs.readFileSync(transcriptPath, "utf8"); } catch { return []; }
  return txt.trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
function lastAssistantText(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type === "assistant" && e.message && Array.isArray(e.message.content)) {
      const texts = e.message.content.filter((c) => c.type === "text").map((c) => c.text);
      if (texts.length) return texts.join("\n");
    }
  }
  return null;
}
function firstNonEmpty(r) { return r ? (r.split("\n").map((s) => s.trim()).find((s) => s.length) || "") : ""; }

try {
  const looksAnchor = (r) => /^ANCHOR:/.test(firstNonEmpty(r));
  let entries = readEntries();
  let reply = lastAssistantText(entries);
  if (reply === null || !looksAnchor(reply)) { sleep(900); entries = readEntries(); reply = lastAssistantText(entries); }

  const anchorLine = reply ? firstNonEmpty(reply) : "";
  let cur = "", chg = "", nxt = "";
  const m = anchorLine.match(/^ANCHOR:\s*(.+)$/);
  if (m) {
    const fm = m[1].match(/current_task\s*=\s*([^|]*?)\s*\|\s*changed\s*=\s*([^|]*?)\s*\|\s*next\s*=\s*(.+)$/);
    if (fm) { cur = fm[1].trim(); chg = fm[2].trim(); nxt = fm[3].trim(); }
  }

  // 解析不到锚点（旧回复未落盘/时序假象/真缺）→ 不用空内容覆盖上一份好状态，直接跳过本轮。
  if (!cur) return done();

  const status = git("status --short");
  const branch = git("rev-parse --abbrev-ref HEAD");
  const lastCommit = git("log --oneline -1");

  let ts = "(no-clock)";
  try { ts = new Date().toISOString(); } catch { /* noop */ }

  const content = [
    "# PROGRESS.md — 实时位置（progress-writer 钩子每轮自动覆盖，勿手改）",
    "",
    "> 看这个文件 = 知道「当前任务内做到哪一步、哪些文件还没存」。",
    "> 粗粒度的「在做第几个任务」看 `TASKS.md`；来龙去脉看 `conversation-log` / `DECISIONS.md`。",
    "",
    "- 更新时间：" + ts,
    "- 分支：" + (branch || "(未知)"),
    "- 最新 commit：" + (lastCommit || "(未知)"),
    "",
    "## 当前位置（取自最近一次回复的锚点）",
    "- current_task：" + (cur || "(未解析到锚点)"),
    "- changed：" + (chg || "—"),
    "- next：" + (nxt || "—"),
    "",
    "## 工作树脏文件（git status --short）",
    "```",
    (status || "(干净，无未提交改动)"),
    "```",
    "",
    "## 原始锚点行",
    "```",
    (anchorLine || "(本轮未读到锚点)"),
    "```",
    "",
  ].join("\n");

  if (DRYRUN) { process.stdout.write(content); return done(); }

  // 省噪音：忽略"更新时间"行后内容没变 → 跳过 commit/push
  const stripTs = (s) => (s || "").replace(/- 更新时间：.*\r?\n/, "");
  let old = "";
  try { old = fs.readFileSync(PROGRESS, "utf8"); } catch { /* 文件不存在 */ }
  if (stripTs(old) === stripTs(content)) return done();

  fs.writeFileSync(PROGRESS, content);

  // —— 进度信息永远只占 main 顶部「一条」progress commit，避免历史碎片 ——
  // HEAD 已是 progress commit 且只动了 PROGRESS.md → amend 重写它(不堆新的)，force-with-lease 推；
  // 否则(HEAD 是真正的 feat/docs commit) → 新建一条 progress(不能 amend 掉真 commit)，普通推。
  // 全程 fail-open：任何 git 失败都不抛、不卡用户。
  const msg = "progress: " + (cur ? cur.slice(0, 72) : "update");
  const PF = JSON.stringify(PROGRESS);
  function sh(cmd) { execSync(cmd, { cwd: PROJECT_DIR, stdio: ["ignore", "pipe", "ignore"] }); }
  function shOut(cmd) { try { return execSync(cmd, { cwd: PROJECT_DIR, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } }

  try {
    sh("git add -- " + PF);

    const headSubject = shOut("git log -1 --format=%s");
    // HEAD 那条 commit 是否「只」改了 PROGRESS.md（确保 amend 不会吞掉别的文件）
    const headFiles = shOut("git show --name-only --format= HEAD").split(/\r?\n/).filter(Boolean);
    const headIsLoneProgress = /^progress:/.test(headSubject) && headFiles.length === 1 && /(^|[\\/])PROGRESS\.md$/.test(headFiles[0]);

    if (headIsLoneProgress) {
      // 重写顶部那条 progress
      sh("git commit -q --amend -m " + JSON.stringify(msg) + " -- " + PF);
      try { sh("git push -q --force-with-lease"); }
      catch { /* 远端领先(双机)/离线：放弃强推，本地已重写，换机靠 reset --hard origin/main 对齐 */ }
    } else {
      // HEAD 是真 commit → 新建一条 progress（首条，之后才会被 amend 折叠）
      sh("git commit -q -m " + JSON.stringify(msg) + " -- " + PF);
      try { sh("git push -q"); } catch { /* 离线：下次补推 */ }
    }
  } catch { /* add/commit 失败：fail-open */ }

  done();
} catch (e) {
  done(); // fail-open
}
