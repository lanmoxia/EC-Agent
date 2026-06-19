"use strict";
/**
 * Stop 钩子：校验本轮最终回复第一行的活状态锚点(ANCHOR)。
 * 由 anchor-check.sh 用 node 绝对路径调用（本机/家里都能定位 node）。
 *
 * 设计原则：
 * - fail-open：脚本自身任何异常都放行(exit 0)，绝不因 bug 把用户卡死。
 * - 防循环：stop_hook_active=true 时最多再判一次，仍不合格也放行(记 unresolved)，不无限 block。
 * - 空话拦截不承诺 100%：只用规则拦"明显糊弄"，语义真实性仍靠模型自觉（见 README/CLAUDE.md）。
 *
 * 退出约定（官方）：exit 0 + stdout 打印 {"decision":"block","reason":...} → 打回重答；
 *                  exit 0 + 无输出 → 放行。
 */
const fs = require("fs");
const path = require("path");

// —— 读取钩子 stdin（{session_id, transcript_path, stop_hook_active, cwd, ...}）——
let input = {};
try { input = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch { input = {}; }
const transcriptPath = input.transcript_path || "";
const stopActive     = input.stop_hook_active === true;
const sessionId      = input.session_id || "unknown";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const LOG = path.join(PROJECT_DIR, ".claude", "anchor-violations.log");

function allowStop() { process.exit(0); }                       // 放行
function block(reason) { process.stdout.write(JSON.stringify({ decision: "block", reason })); process.exit(0); }
function sleep(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* noop */ } }
function logViolation(note, fails, anchorLine, userPrompt) {
  const ts = new Date().toISOString();
  const line = [
    ts, sessionId, note,
    "fails=[" + fails.join(",") + "]",
    "anchor=" + JSON.stringify((anchorLine || "MISSING").slice(0, 240)),
    "user=" + JSON.stringify((userPrompt || "").slice(0, 140)),
  ].join(" | ") + "\n";
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, line); } catch { /* noop */ }
}

// —— transcript 解析 ——
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
function lastUserPromptIndex(entries) {
  // 最近一条"真实用户输入"(非 tool_result)的下标
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type === "user" && e.message && e.message.role === "user") {
      const c = e.message.content;
      if (typeof c === "string" && c.trim()) return i;
      if (Array.isArray(c) && c.some((b) => b.type === "text")) return i;
    }
  }
  return -1;
}
function userPromptText(entries, idx) {
  if (idx < 0) return "";
  const c = entries[idx].message.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return "";
}
function toolsSince(entries, idx) {
  const tools = [];
  for (let i = Math.max(idx, 0); i < entries.length; i++) {
    const e = entries[i];
    if (e.type === "assistant" && e.message && Array.isArray(e.message.content)) {
      for (const b of e.message.content) if (b.type === "tool_use") tools.push(b.name);
    }
  }
  return tools;
}

// —— 空话/真实性规则（只拦明显糊弄，不保证 100%）——
const PLACEHOLDERS = { current_task: "当前任务", changed: "本轮改了什么", next: "下一步" };
const GENERIC = ["优化", "处理", "完成", "继续", "任务", "相关", "一些", "东西", "内容", "事情", "工作", "后续", "等待", "指示", "搞定", "好的", "已完成", "按要求", "收到", "推进"];
const CHANGED_FILLER = /^(无|没有|已完成|按要求处理|优化完成|完成|完成了|搞定|处理完成|done)[。.\s]*$/i;
const NEXT_FILLER    = /^(继续优化|后续处理|等待指示|继续|后续|待定|看情况|再说|继续推进|保持现状)[。.\s]*$/i;
const CONCRETE = /[\/.]\w|`|\d|(新建|修改|删除|提交|创建|写入|运行|执行|校验|验证|测试|落库|更新|接线|commit|git|node|append|edit|write)/i;

function tokens(s) {
  if (!s) return [];
  const out = [];
  for (const run of s.match(/[一-龥]{2,}/g) || []) {
    out.push(run);
    for (let i = 0; i + 2 <= run.length; i++) out.push(run.slice(i, i + 2)); // 2-gram 提高重合率(保守，只在"完全不重合"才判负)
  }
  for (const w of s.match(/[A-Za-z0-9_.\-\/]{3,}/g) || []) out.push(w.toLowerCase());
  return out;
}
function strippedGeneric(s) {
  let r = (s || "").trim();
  for (const g of GENERIC) r = r.split(g).join("");
  return r.replace(/[\s，。、,.|/]+/g, "");
}

try {
  // 写时序守卫（要求#3）：刚结束的回复可能还没落盘，往回扫会读到"上一轮"旧回复。
  // 故：没读到回复、或读到的回复首行不是 ANCHOR(疑似旧回复)，都 sleep 后重读一次确认。
  const firstNE = (r) => (r ? (r.split("\n").map((s) => s.trim()).find((s) => s.length) || "") : "");
  const looksAnchor = (r) => /^ANCHOR:/.test(firstNE(r));
  let entries = readEntries();
  let reply = lastAssistantText(entries);
  if (reply === null || !looksAnchor(reply)) {   // 旧回复 or 真缺，都重读一次
    sleep(900);
    entries = readEntries();
    reply = lastAssistantText(entries);
  }
  if (reply === null) { logViolation("no-assistant-text", ["no_reply"], null, ""); allowStop(); } // 无可校验，放行

  const uIdx = lastUserPromptIndex(entries);
  const userPrompt = userPromptText(entries, uIdx);
  const toolsThisTurn = toolsSince(entries, uIdx);
  const mutated = toolsThisTurn.some((t) => /^(Write|Edit|NotebookEdit)$/.test(t));

  const firstLine = (reply.split("\n").map((s) => s.trim()).find((s) => s.length)) || "";
  const fails = [];

  // 1) 锚点行存在且在首行
  const m = firstLine.match(/^ANCHOR:\s*(.+)$/);
  if (!m) {
    logViolation(stopActive ? "unresolved-after-retry" : "blocked", ["no_anchor_first_line"], firstLine, userPrompt);
    if (stopActive) allowStop();
    block("你本轮回复第一行不是活状态锚点。第一行必须是：\nANCHOR: lanmoxia | current_task=<具体任务> | changed=<本轮真实改动> | next=<下一步具体动作>\n请把锚点放到回复最开头后重答。");
  }
  const body = m[1];

  // 2) 含 lanmoxia
  if (!/lanmoxia/.test(body)) fails.push("missing_lanmoxia");

  // 解析三字段
  const fm = body.match(/current_task\s*=\s*([^|]*?)\s*\|\s*changed\s*=\s*([^|]*?)\s*\|\s*next\s*=\s*(.+)$/);
  if (!fm) {
    logViolation(stopActive ? "unresolved-after-retry" : "blocked", ["bad_field_format"], firstLine, userPrompt);
    if (stopActive) allowStop();
    block("锚点字段格式不对。必须是：ANCHOR: lanmoxia | current_task=… | changed=… | next=…（顺序与竖线分隔不变）。请重答。");
  }
  const current_task = (fm[1] || "").trim();
  const changed = (fm[2] || "").trim();
  const next = (fm[3] || "").trim();

  // 3) current_task 不是空话/占位
  if (!current_task || current_task === PLACEHOLDERS.current_task || current_task.length < 4 || strippedGeneric(current_task).length < 2)
    fails.push("current_task_filler");

  // 4) changed 必须对应真实操作（要求#2 + 原#4）
  if (!changed || changed === PLACEHOLDERS.changed) fails.push("changed_empty");
  else if (CHANGED_FILLER.test(changed)) fails.push("changed_filler");
  else if (mutated && !CONCRETE.test(changed)) fails.push("changed_not_match_ops"); // 本轮动了文件却没写具体改动

  // 5) next 不是空话
  if (!next || next === PLACEHOLDERS.next || NEXT_FILLER.test(next) || tokens(next).length === 0)
    fails.push("next_filler");

  // 6) 与本轮用户请求关键词完全不重合 → 判负（要求#1；用户请求过短则跳过，避免误伤）
  const uTok = new Set(tokens(userPrompt));
  if (uTok.size >= 3) {
    const overlap = tokens(current_task + " " + changed + " " + next).some((t) => uTok.has(t));
    if (!overlap) fails.push("no_overlap_with_user_request");
  }

  if (fails.length) {
    logViolation(stopActive ? "unresolved-after-retry" : "blocked", fails, firstLine, userPrompt);
    if (stopActive) allowStop();        // 已重试过一次仍不合格 → 放行(记账)，不死循环
    block(
      "活状态锚点不合格，被打回。问题：" + fails.join("、") + "\n" +
      "要求：current_task/changed/next 必须具体、真实、对应本轮操作，且与用户请求相关；" +
      "changed 不能是『无/已完成/按要求处理』之类空话。请修正锚点后重答整条回复。"
    );
  }

  allowStop(); // 合格，静默放行
} catch (e) {
  // fail-open：脚本异常不卡用户
  try { logViolation("hook-error", [String(e && e.message || e).slice(0, 80)], null, ""); } catch { /* noop */ }
  allowStop();
}
