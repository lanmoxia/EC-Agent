"use strict";

/**
 * 视频分析报告「准确性校验」— 四层校验
 *
 * L1 groundTruth   确定性地面真值（ffprobe/ffmpeg，零模型成本）
 * L2 recheck       定向复核（再喂一次视频，只问最致命的几个是非/选择题）
 * L3 firstFrame    首帧图像接地（抽第0帧单图 vision，专治第2段构图）
 * L4 (聚合/台账在 analysis.service 编排，本文件只产出结构化结果)
 *
 * 设计原则：任一层失败都不影响主流程，只在结果里标 skipped + reason。
 * 产出统一结构：
 *   {
 *     findings: [{ layer, level, field, claim, truth, msg }],  // level: error|warn|info|ok
 *     groundTruth: {...}, recheck: {...}, firstFrame: {...},   // 各层原始数据/状态
 *   }
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const config = require("../config");
const { callDashScope } = require("./dashscope");

// ── 共享工具 ──────────────────────────────────────────────────────

function ff(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

/** ffprobe 取视频元数据：时长/宽高/帧率/总帧数 */
function probeMeta(file) {
  try {
    const out = ff(
      `ffprobe -v error -select_streams v:0 ` +
      `-show_entries stream=width,height,r_frame_rate,nb_frames ` +
      `-show_entries format=duration ` +
      `-of json "${file}"`
    );
    const j = JSON.parse(out);
    const s = (j.streams && j.streams[0]) || {};
    const fmt = j.format || {};
    const duration = parseFloat(fmt.duration);
    const width = parseInt(s.width, 10) || null;
    const height = parseInt(s.height, 10) || null;
    let fps = null;
    if (s.r_frame_rate && s.r_frame_rate.includes("/")) {
      const [n, d] = s.r_frame_rate.split("/").map(Number);
      if (d) fps = n / d;
    }
    return {
      ok: true,
      duration: isFinite(duration) && duration > 0 ? duration : null,
      width, height,
      fps: fps ? Math.round(fps * 100) / 100 : null,
      nbFrames: parseInt(s.nb_frames, 10) || null,
    };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/** 由宽高推断画幅比例标签（9:16 / 16:9 / 1:1 / 4:3 / 3:4 / 其它） */
function aspectLabel(w, h) {
  if (!w || !h) return null;
  const r = w / h;
  const cands = [
    { label: "9:16", v: 9 / 16 },
    { label: "3:4",  v: 3 / 4 },
    { label: "1:1",  v: 1 },
    { label: "4:3",  v: 4 / 3 },
    { label: "16:9", v: 16 / 9 },
  ];
  let best = cands[0], bestDiff = Infinity;
  for (const c of cands) {
    const d = Math.abs(r - c.v);
    if (d < bestDiff) { bestDiff = d; best = c; }
  }
  // 容差 8%，超出就给原始比值
  return bestDiff / best.v <= 0.08 ? best.label : `${r.toFixed(2)}:1`;
}

/**
 * ffmpeg 场景切换检测 → 估算硬切数 / 镜头数。
 * 用 scene 分值阈值统计跳变次数；shots = cuts + 1。
 * 短视频用较高阈值（0.4）以减少误报。
 */
function detectScenes(file, threshold = 0.5) {
  try {
    // showinfo 会把每个被选中的场景帧打到 stderr
    const out = execSync(
      `ffmpeg -hide_banner -i "${file}" -filter:v "select='gt(scene,${threshold})',showinfo" -f null - 2>&1`,
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
    );
    const cuts = (out.match(/Parsed_showinfo/g) || []).length;
    return { ok: true, cuts, shots: cuts + 1, threshold };
  } catch (e) {
    // ffmpeg 把信息打到 stderr，非零退出也可能带可用输出
    const out = (e.stdout || "") + (e.stderr || "");
    const cuts = (out.match(/Parsed_showinfo/g) || []).length;
    if (cuts > 0) return { ok: true, cuts, shots: cuts + 1, threshold };
    return { ok: false, reason: e.message };
  }
}

// ── 报告分段抓取 ──────────────────────────────────────────────────

/** 抓取报告中的第 n 段（## n. ... 到下一个 ## ）文本 */
function extractSection(report, n) {
  const re = new RegExp(`##\\s*${n}[\\.．][\\s\\S]*?(?=##\\s*\\d+[\\.．]|$)`);
  const m = (report || "").match(re);
  return m ? m[0] : "";
}

// ── L1 确定性地面真值 ─────────────────────────────────────────────

/**
 * 用 ffprobe/ffmpeg 的确定性测量纠正报告 §1 的基础信息。
 * @returns {{ skipped?:boolean, reason?:string, meta?:object, scenes?:object, findings:Array }}
 */
function layerGroundTruth(videoPath, report) {
  const findings = [];
  const meta = probeMeta(videoPath);
  if (!meta.ok) {
    return { skipped: true, reason: `ffprobe 不可用：${meta.reason}`, findings };
  }

  const sec1 = extractSection(report, 1);

  // 1) 时长比对
  if (meta.duration != null) {
    const m = sec1.match(/(\d+(?:\.\d+)?)\s*(?:s|秒)/);
    const claimed = m ? parseFloat(m[1]) : null;
    if (claimed != null && Math.abs(claimed - meta.duration) > 1.0) {
      findings.push({
        layer: "L1", level: "error", field: "时长",
        claim: `${claimed}s`, truth: `${meta.duration.toFixed(1)}s`,
        msg: `报告时长 ${claimed}s 与实测 ${meta.duration.toFixed(1)}s 不符（差 ${Math.abs(claimed - meta.duration).toFixed(1)}s）`,
      });
    } else if (claimed != null) {
      findings.push({ layer: "L1", level: "ok", field: "时长", claim: `${claimed}s`, truth: `${meta.duration.toFixed(1)}s`, msg: `时长一致（${meta.duration.toFixed(1)}s）` });
    }
  }

  // 2) 画幅比例比对
  const truthAspect = aspectLabel(meta.width, meta.height);
  if (truthAspect) {
    // 把报告里出现的比例 token 抓出来（9:16 / 16:9 等）
    const claimMatch = sec1.match(/(\d{1,2}\s*[:：]\s*\d{1,2})/);
    const claimAspect = claimMatch ? claimMatch[1].replace(/\s|：/g, m => (m === "：" ? ":" : "")) : null;
    const normClaim = claimAspect ? claimAspect.replace("：", ":") : null;
    if (normClaim && normClaim !== truthAspect) {
      findings.push({
        layer: "L1", level: "error", field: "画幅比例",
        claim: normClaim, truth: truthAspect,
        msg: `报告画幅 ${normClaim} 与实测 ${truthAspect}（${meta.width}×${meta.height}）不符`,
      });
    } else if (normClaim) {
      findings.push({ layer: "L1", level: "ok", field: "画幅比例", claim: normClaim, truth: truthAspect, msg: `画幅一致（${truthAspect}）` });
    } else {
      findings.push({ layer: "L1", level: "info", field: "画幅比例", claim: null, truth: truthAspect, msg: `实测画幅 ${truthAspect}（${meta.width}×${meta.height}），报告未明确标注` });
    }
  }

  // 3) 镜头数 / 一镜到底比对（仅当场景检测成功）
  const scenes = detectScenes(videoPath);
  if (scenes.ok) {
    const claimsOneTake = /一镜到底/.test(sec1);
    const shotMatch = sec1.match(/(\d+)\s*个?\s*分镜|共\s*(\d+)\s*镜|镜头数[：:]\s*(\d+)/);
    const claimedShots = shotMatch ? parseInt(shotMatch[1] || shotMatch[2] || shotMatch[3], 10) : null;

    if (claimsOneTake && scenes.cuts >= 1) {
      findings.push({
        layer: "L1", level: "warn", field: "镜头数",
        claim: "一镜到底", truth: `检出 ${scenes.cuts} 处硬切（${scenes.shots} 镜）`,
        msg: `报告称「一镜到底」，但 ffmpeg 检出 ${scenes.cuts} 处可能硬切（阈值 ${scenes.threshold}），请人工确认是否漏判分镜`,
      });
    } else if (claimedShots != null && Math.abs(claimedShots - scenes.shots) >= 2) {
      findings.push({
        layer: "L1", level: "warn", field: "镜头数",
        claim: `${claimedShots} 镜`, truth: `约 ${scenes.shots} 镜`,
        msg: `报告 ${claimedShots} 个分镜，ffmpeg 估算约 ${scenes.shots} 镜（检出 ${scenes.cuts} 处切换，阈值 ${scenes.threshold}，仅供参考）`,
      });
    }
  }

  return { meta, scenes, findings };
}

// ── 视频/图像 data url ────────────────────────────────────────────

const MAX_INLINE_SIZE = 50 * 1024 * 1024;

function videoMime(file) {
  const ext = path.extname(file).toLowerCase().replace(".", "");
  const map = { mp4: "mp4", mov: "quicktime", mkv: "x-matroska", webm: "webm", avi: "x-msvideo", m4v: "mp4" };
  return `video/${map[ext] || "mp4"}`;
}

function imageMime(file) {
  const ext = path.extname(file).toLowerCase().replace(".", "");
  const map = { jpg: "jpeg", jpeg: "jpeg", png: "png", webp: "webp" };
  return `image/${map[ext] || "jpeg"}`;
}

function toVideoDataUrl(file) {
  const stat = fs.statSync(file);
  if (stat.size > MAX_INLINE_SIZE) {
    throw Object.assign(new Error(`视频过大（${(stat.size / 1024 / 1024).toFixed(1)}MB > 50MB）`), { code: "FILE_TOO_LARGE" });
  }
  return `data:${videoMime(file)};base64,${fs.readFileSync(file).toString("base64")}`;
}

function toImageDataUrl(file) {
  return `data:${imageMime(file)};base64,${fs.readFileSync(file).toString("base64")}`;
}

/** 从模型回复里稳健地抠出 JSON（容忍 ```json 包裹、前后缀文字） */
function extractJson(text) {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  // 找第一个 { 到最后一个 }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ── L2 定向复核（盲审 + 字段级比对） ─────────────────────────────

/**
 * 10 个最致命字段，每个带枚举值，使两次独立判断可被程序比对。
 * type: 'int' 整数比对；'enum' 枚举字符串比对。
 * uncertain/unclear 一律视为「不确定」，不判矛盾只标存疑。
 */
const FATAL_FIELDS = [
  { key: "char_count",         label: "画面人物数量",       type: "int" },
  { key: "is_one_take",        label: "是否一镜到底",       type: "enum", enums: ["yes", "no", "uncertain"] },
  { key: "shot_count",         label: "镜头数量",           type: "int" },
  { key: "subject_position",   label: "主体水平位置",       type: "enum", enums: ["left", "center", "right", "unclear"] },
  { key: "entry_direction",    label: "人物入画方向",       type: "enum", enums: ["from_left", "from_right", "from_top", "from_bottom", "already_present", "no_movement", "uncertain"] },
  { key: "movement_direction", label: "主体移动方向",       type: "enum", enums: ["left_to_right", "right_to_left", "near_to_far", "far_to_near", "static", "uncertain"] },
  { key: "voice_type",         label: "声源画内/画外",      type: "enum", enums: ["onscreen", "offscreen", "both", "none", "uncertain"] },
  { key: "speaker_count",      label: "说话人数量",         type: "int" },
  { key: "book_face",          label: "书封面朝向",         type: "enum", enums: ["toward_camera", "away_from_camera", "toward_subject", "side", "no_book", "uncertain"] },
  { key: "camera_motion",      label: "主镜头运动",         type: "enum", enums: ["static", "push_in", "pull_back", "pan_left", "pan_right", "tilt", "handheld_follow", "mixed", "uncertain"] },
];

const UNCERTAIN_VALS = new Set(["uncertain", "unclear", "unknown", "", null, undefined]);

/** 渲染字段问卷（两个 prompt 共用，保证抽取与盲审问的是同一组字段/同一组枚举） */
function buildFieldSpec() {
  return FATAL_FIELDS.map((f, i) => {
    if (f.type === "int") {
      return `${i + 1}. ${f.key}（${f.label}）：填整数；数不清填 "uncertain"`;
    }
    return `${i + 1}. ${f.key}（${f.label}）：从 [${f.enums.join(", ")}] 选一个`;
  }).join("\n");
}

/** 归一化字段值用于比对 */
function normVal(field, v) {
  if (v === null || v === undefined) return "uncertain";
  let s = String(v).trim().toLowerCase();
  if (field.type === "int") {
    if (UNCERTAIN_VALS.has(s) || s === "uncertain") return "uncertain";
    const n = parseInt(s, 10);
    return isFinite(n) ? String(n) : "uncertain";
  }
  if (UNCERTAIN_VALS.has(s)) return "uncertain";
  // 容错：枚举不在表里则归为 uncertain（避免拼写差异误判矛盾）
  return field.enums.includes(s) ? s : "uncertain";
}

/** ① 从报告散文抽 10 字段事实表（文本调用，便宜）。报告不动，只读。 */
async function extractFactSheet(report, { onProgress = () => {} } = {}) {
  const prompt = `下面是一份视频分析报告。请只从报告内容中**抽取**以下字段的取值（不要自己推测视频，只如实反映报告写了什么）。报告没提到的字段填 "uncertain"。

${buildFieldSpec()}

严格只输出 JSON，键为上面的英文 key：
{ "char_count": "...", "is_one_take": "...", "shot_count": "...", "subject_position": "...", "entry_direction": "...", "movement_direction": "...", "voice_type": "...", "speaker_count": "...", "book_face": "...", "camera_motion": "..." }

—— 报告全文 ——
${report}`;

  onProgress("抽取报告致命字段事实表…");
  const raw = await callDashScope([{ type: "text", text: prompt }], { maxTokens: 500 });
  return extractJson(raw);
}

/** ② 盲审：只看视频答封闭题，**不给报告**，避免锚定偏差。 */
async function blindVerify(videoUrl, { onProgress = () => {} } = {}) {
  const prompt = `你是独立的视频审核员。请**只观看这段视频**，回答以下字段。不要参考任何外部描述，凭你看到的画面独立判断。看不清的字段填 "uncertain"，不要猜。

${buildFieldSpec()}

判断要点：
- 移动方向/入画方向：以画面 2D 坐标为准（画面左边=left，远处=画面上方）。这是最易错项，务必看仔细。
- 一镜到底：注意「书闭合→翻开」「人物姿态瞬间不连贯」这类瞬间硬切，有则填 no。
- 声源：分清画内人物在说话（嘴动）还是画外配音。

严格只输出 JSON，键为上面的英文 key：
{ "char_count": "...", "is_one_take": "...", "shot_count": "...", "subject_position": "...", "entry_direction": "...", "movement_direction": "...", "voice_type": "...", "speaker_count": "...", "book_face": "...", "camera_motion": "..." }`;

  onProgress("定向复核：盲审视频（不看报告）…");
  const raw = await callDashScope([
    { type: "video_url", video_url: { url: videoUrl } },
    { type: "text", text: prompt },
  ], { maxTokens: 600 });
  return extractJson(raw);
}

/**
 * L2：盲审 + 字段级比对。
 * report→事实表（文本）与 video→盲审（封闭题）两路**独立**产出，
 * 程序逐字段 diff：两边都确定且不等→矛盾(error)；一边不确定→存疑(warn)；相等→一致(ok)。
 * 返回 fields 数组（含两边取值）供下游「堵泄漏」判断。
 */
async function layerRecheck(videoPath, report, { onProgress = () => {} } = {}) {
  const findings = [];
  let videoUrl;
  try {
    videoUrl = toVideoDataUrl(videoPath);
  } catch (e) {
    return { skipped: true, reason: `无法读取视频：${e.message}`, findings };
  }

  let sheet, verify;
  try {
    // 两路独立调用：事实表抽取（文本）+ 盲审（视频）。并行省时。
    [sheet, verify] = await Promise.all([
      extractFactSheet(report, { onProgress }),
      blindVerify(videoUrl, { onProgress }),
    ]);
  } catch (e) {
    return { skipped: true, reason: `复核调用失败：${e.message}`, findings };
  }

  if (!sheet && !verify) {
    return { skipped: true, reason: "事实表与盲审均无法解析为 JSON", findings };
  }
  if (!verify) {
    return { skipped: true, reason: "盲审返回无法解析为 JSON", findings };
  }
  if (!sheet) {
    return { skipped: true, reason: "报告事实表返回无法解析为 JSON", findings };
  }

  const fields = [];
  for (const f of FATAL_FIELDS) {
    const rep = normVal(f, sheet[f.key]);
    const vid = normVal(f, verify[f.key]);
    const repUnc = rep === "uncertain";
    const vidUnc = vid === "uncertain";

    let level, msg;
    if (!repUnc && !vidUnc && rep !== vid) {
      level = "error";
      msg = `【${f.label}】报告：${rep} ✗ 盲审：${vid}`;
    } else if (repUnc && vidUnc) {
      level = "info";
      msg = `【${f.label}】两边均未明确`;
    } else if (repUnc || vidUnc) {
      level = "warn";
      msg = `【${f.label}】单边不确定（报告：${rep} / 盲审：${vid}），建议人工看一眼`;
    } else {
      level = "ok";
      msg = `【${f.label}】一致（${vid}）`;
    }

    findings.push({ layer: "L2", level, field: f.label, key: f.key, claim: rep, truth: vid, msg });
    fields.push({ key: f.key, label: f.label, report: rep, video: vid, level });
  }

  return { sheet, verify, fields, findings };
}

// ── L3 首帧图像接地 ───────────────────────────────────────────────

/** 抽取视频第 0 秒首帧到临时文件，返回路径（失败返回 null） */
function extractFirstFrame(videoPath) {
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ecacc-"));
    const out = path.join(dir, "frame0.jpg");
    // -ss 0.1 避开纯黑首帧；-frames:v 1 只取一帧
    ff(`ffmpeg -y -ss 0.1 -i "${videoPath}" -frames:v 1 -q:v 2 "${out}"`);
    return fs.existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * L3：抽首帧当静态单图，让模型只判定「第一帧构图」最易错的几项，
 * 与报告 §2 比对。静态单图判左右/象限比在整段视频里分注意力更准。
 */
async function layerFirstFrame(videoPath, report, { onProgress = () => {} } = {}) {
  const findings = [];
  const framePath = extractFirstFrame(videoPath);
  if (!framePath) {
    return { skipped: true, reason: "无法抽取首帧（ffmpeg 不可用？）", findings };
  }

  const sec2 = extractSection(report, 2) || "（报告无第2段）";
  let imgUrl;
  try {
    imgUrl = toImageDataUrl(framePath);
  } catch (e) {
    return { skipped: true, reason: `首帧读取失败：${e.message}`, findings };
  }

  const prompt = `这是一段视频的**第一帧静态截图**。下面还附了一份分析报告里「第2段·第一帧精确构图」的描述。
请只看这张静态图，核对报告对第一帧的描述是否准确。重点核对这几项最易错的：
1. compose_direction — 路/地面/动线的 2D 方向（从画面哪边到哪边，同时含上下）
2. char_position — 角色在画面的位置与占比（左/中/右 + 上/下象限）
3. char_facing — 角色朝向（正对/侧向/背对镜头）
4. char_posture — 角色第0秒体态（走动中/静止站立/说话）
5. layout — 主要背景元素的象限位置

针对每项，对比「报告说法」与「你看图所见」，输出 match：ok / mismatch / uncertain。

严格只输出 JSON：
{ "items": [ { "key": "compose_direction", "reportSays": "简短", "imageShows": "简短", "match": "ok|mismatch|uncertain" } ] }

—— 报告第2段 ——
${sec2}`;

  onProgress("首帧接地：单图核对第一帧构图…");
  let raw;
  try {
    raw = await callDashScope([
      { type: "image_url", image_url: { url: imgUrl } },
      { type: "text", text: prompt },
    ], { maxTokens: 900 });
  } catch (e) {
    cleanupFrame(framePath);
    return { skipped: true, reason: `首帧调用失败：${e.message}`, findings };
  }
  cleanupFrame(framePath);

  const parsed = extractJson(raw);
  if (!parsed || !Array.isArray(parsed.items)) {
    return { skipped: true, reason: "首帧返回无法解析为 JSON", raw, findings };
  }

  const LABELS = {
    compose_direction: "首帧·动线方向",
    char_position: "首帧·角色位置占比",
    char_facing: "首帧·角色朝向",
    char_posture: "首帧·初始体态",
    layout: "首帧·背景布局",
  };
  for (const it of parsed.items) {
    const label = LABELS[it.key] || `首帧·${it.key}`;
    if (it.match === "mismatch") {
      findings.push({ layer: "L3", level: "error", field: label, claim: it.reportSays || "", truth: it.imageShows || "", msg: `【${label}】报告：${it.reportSays || "?"} ✗ 首帧图：${it.imageShows || "?"}` });
    } else if (it.match === "uncertain") {
      findings.push({ layer: "L3", level: "warn", field: label, claim: it.reportSays || "", truth: it.imageShows || "", msg: `【${label}】首帧图无法确认（报告：${it.reportSays || "?"}）` });
    } else {
      findings.push({ layer: "L3", level: "ok", field: label, claim: it.reportSays || "", truth: it.imageShows || "", msg: `【${label}】一致` });
    }
  }

  return { raw, items: parsed.items, findings };
}

function cleanupFrame(framePath) {
  try {
    fs.rmSync(path.dirname(framePath), { recursive: true, force: true });
  } catch { /* ignore */ }
}

// ── 聚合：按 config 开关跑各层，汇总结果 ──────────────────────────

const LEVEL_RANK = { error: 3, warn: 2, info: 1, ok: 0 };

/**
 * 跑全部启用的准确性校验层，汇总为单一结构。
 * @returns {{
 *   findings: Array, errors: Array, warnings: Array,
 *   summary: {errors:number, warnings:number, infos:number, oks:number, verdict:string},
 *   layers: {groundTruth, recheck, firstFrame},
 *   meta: object|null
 * }}
 */
async function runAccuracyChecks(videoPath, report, { onProgress = () => {} } = {}) {
  const acc = config.accuracy || {};
  const layers = {};
  let allFindings = [];

  // L1 确定性地面真值
  if (acc.groundTruth) {
    try {
      const r = layerGroundTruth(videoPath, report);
      layers.groundTruth = r;
      allFindings = allFindings.concat(r.findings || []);
    } catch (e) {
      layers.groundTruth = { skipped: true, reason: e.message, findings: [] };
    }
  } else {
    layers.groundTruth = { skipped: true, reason: "已关闭（config）", findings: [] };
  }

  // L2 定向复核
  if (acc.recheck) {
    try {
      const r = await layerRecheck(videoPath, report, { onProgress });
      layers.recheck = r;
      allFindings = allFindings.concat(r.findings || []);
    } catch (e) {
      layers.recheck = { skipped: true, reason: e.message, findings: [] };
    }
  } else {
    layers.recheck = { skipped: true, reason: "已关闭（config）", findings: [] };
  }

  // L3 首帧图像接地
  if (acc.firstFrame) {
    try {
      const r = await layerFirstFrame(videoPath, report, { onProgress });
      layers.firstFrame = r;
      allFindings = allFindings.concat(r.findings || []);
    } catch (e) {
      layers.firstFrame = { skipped: true, reason: e.message, findings: [] };
    }
  } else {
    layers.firstFrame = { skipped: true, reason: "已关闭（config）", findings: [] };
  }

  // 排序：error → warn → info → ok
  allFindings.sort((a, b) => (LEVEL_RANK[b.level] || 0) - (LEVEL_RANK[a.level] || 0));

  const errors = allFindings.filter(f => f.level === "error");
  const warnings = allFindings.filter(f => f.level === "warn");
  const infos = allFindings.filter(f => f.level === "info");
  const oks = allFindings.filter(f => f.level === "ok");

  const verdict = errors.length > 0 ? "fail"
    : warnings.length > 0 ? "review"
    : "pass";

  // 冲突字段（error 级，带两边取值）——供下游「堵泄漏」给提示词生成用
  const conflictFields = (layers.recheck && layers.recheck.fields || [])
    .filter(f => f.level === "error");

  return {
    findings: allFindings,
    errors, warnings,
    conflictFields,
    summary: {
      errors: errors.length,
      warnings: warnings.length,
      infos: infos.length,
      oks: oks.length,
      verdict,
    },
    layers,
    meta: (layers.groundTruth && layers.groundTruth.meta) || null,
  };
}

/**
 * 「堵下游泄漏」：把冲突/存疑字段渲染成给提示词生成模型的警示段。
 * 按 CLAUDE.md 批处理原则——不硬停，强标注：提醒生成模型这些字段不可靠，
 * 遇到时优先保守/中性处理，不要把错误描述写进提示词。
 * @returns {string} 注入 prompt 的文本（无冲突返回 ""）
 */
function buildConflictNote(accuracy) {
  if (!accuracy) return "";
  const conflicts = accuracy.conflictFields || [];
  const warns = (accuracy.warnings || []).filter(w => w.layer === "L2");
  if (!conflicts.length && !warns.length) return "";

  const lines = ["## ⚠ 准确性存疑字段（这些字段报告与独立盲审不一致，不可信，写提示词时务必谨慎）"];
  for (const c of conflicts) {
    lines.push(`- ${c.label}：报告说「${c.report}」，盲审看到「${c.video}」——两者矛盾，**不要把任一方写死进提示词**，改用中性/保守描述或省略该细节。`);
  }
  for (const w of warns) {
    lines.push(`- ${w.field}：存疑（${w.msg}）——谨慎处理。`);
  }
  lines.push("处理原则：宁可少写一个不确定的细节，也不要写错方向/朝向/人数等硬骨架。");
  return lines.join("\n") + "\n";
}

// ── L4 台账：把分歧追加写入 accuracy-issues.md ────────────────────

function appendLedger(videoName, accuracy) {
  const acc = config.accuracy || {};
  if (!acc.ledger) return;
  const flagged = [...(accuracy.errors || []), ...(accuracy.warnings || [])];
  if (!flagged.length) return; // 全通过不记台账

  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const lines = [`\n## ${ts} | ${videoName} | ${accuracy.summary.verdict.toUpperCase()}`];
  for (const f of flagged) {
    const tag = f.level === "error" ? "❌" : "⚠️";
    lines.push(`- ${tag} [${f.layer}] ${f.field}：${f.msg}`);
  }

  try {
    if (!fs.existsSync(acc.ledgerPath)) {
      fs.writeFileSync(acc.ledgerPath, "# 准确性校验台账\n\n记录每次分析被标红/标黄的字段，用于发现模型最常错的类型，反哺 prompt 加固。\n", "utf8");
    }
    fs.appendFileSync(acc.ledgerPath, lines.join("\n") + "\n", "utf8");
  } catch { /* 台账写失败不影响主流程 */ }
}

module.exports = {
  // 共享工具（供后续层/测试复用）
  probeMeta, aspectLabel, detectScenes, extractSection,
  toVideoDataUrl, toImageDataUrl, extractJson, extractFirstFrame,
  // 字段表 + 子步骤
  FATAL_FIELDS, extractFactSheet, blindVerify,
  // 各层
  layerGroundTruth, layerRecheck, layerFirstFrame,
  // 聚合 + 台账 + 堵泄漏
  runAccuracyChecks, appendLedger, buildConflictNote,
};
