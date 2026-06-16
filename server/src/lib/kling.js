"use strict";

/**
 * 可灵（kling）逐镜提示词生成
 *
 * 与豆包（1 段散文）不同，可灵是逐镜输出：先把视频切成 N 个镜头（分镜），
 * 再为每个镜头生成提示词。本模块负责：
 *   1. parseShots —— 从报告 §1/§7 解析镜头列表，用 ffmpeg 切点（L1）双保校验
 *   2. generateKlingPrompts —— 逐镜 × 多版本（简洁/复杂/带时间戳详细）生成
 */

const { callDashScope } = require("./dashscope");
const { detectScenes, extractSection } = require("./accuracy");

// ── 时间解析 ──────────────────────────────────────────────────────

/** "M:SS(.s)" 或纯秒 → 秒数 */
function toSeconds(str) {
  if (str == null) return null;
  const s = String(str).trim();
  if (s.includes(":")) {
    const [m, sec] = s.split(":");
    const v = parseInt(m, 10) * 60 + parseFloat(sec);
    return isFinite(v) ? v : null;
  }
  const v = parseFloat(s);
  return isFinite(v) ? v : null;
}

/** 抓取文本里所有时间段 [{start,end,raw}] */
function extractRanges(text) {
  const out = [];
  const re = /(\d{1,2}:\d{2}(?:\.\d+)?)\s*[～~—\-–→至到]\s*(\d{1,2}:\d{2}(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = toSeconds(m[1]);
    const end = toSeconds(m[2]);
    if (start != null && end != null && end > start) {
      out.push({ start, end, raw: m[0] });
    }
  }
  return out;
}

// ── 分镜解析（报告为主 + ffmpeg 切点双保） ───────────────────────

/**
 * 从分析报告解析镜头列表。
 * 主来源：§7（镜头运动时序，含分段时间）→ 退化到 §1（分镜说明）。
 * 校验：与 ffmpeg detectScenes 实测切点比对，差异大时给 note 提示（不硬停）。
 *
 * @param {string} videoPath  视频路径（ffmpeg 校验用，可空）
 * @param {string} report     分析报告全文
 * @param {number} duration   实测时长（秒），用于补全末镜
 * @returns {{ shots: Array<{index,start,end,desc}>, note: string|null, source: string }}
 */
function parseShots(videoPath, report, duration = null) {
  const sec7 = extractSection(report, 7);
  const sec1 = extractSection(report, 1);

  // 优先用 §7 的时间段（镜头运动时序最规整）
  let ranges = extractRanges(sec7);
  let source = "§7";
  if (ranges.length === 0) {
    ranges = extractRanges(sec1);
    source = "§1";
  }

  // 去重 + 排序（同一时间段在 §7 可能重复出现）
  const seen = new Set();
  ranges = ranges
    .filter(r => {
      const k = `${r.start.toFixed(1)}-${r.end.toFixed(1)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.start - b.start);

  // 报告没有任何时间段 → 退化为单镜（整段）
  let shots;
  if (ranges.length === 0) {
    shots = [{ index: 1, start: 0, end: duration || null, desc: "整段（报告未给分镜时间，按单镜处理）" }];
    source = "fallback-single";
  } else {
    shots = ranges.map((r, i) => ({
      index: i + 1,
      start: r.start,
      end: r.end,
      desc: extractShotDesc(sec7 || sec1, r.raw),
    }));
    // 末镜若早于实测时长，补到结尾
    if (duration && shots.length) {
      const last = shots[shots.length - 1];
      if (duration - last.end > 1) last.end = duration;
    }
  }

  // ffmpeg 双保校验
  let note = null;
  if (videoPath) {
    const sc = detectScenes(videoPath);
    if (sc.ok) {
      const reportShots = shots.length;
      const ffShots = sc.shots;
      if (Math.abs(reportShots - ffShots) >= 2) {
        note = `报告解析出 ${reportShots} 个镜头，ffmpeg 实测约 ${ffShots} 镜（检出 ${sc.cuts} 处切点）。两者差异较大，可灵逐镜可能漏镜/多镜，请人工核对分镜。`;
      }
    }
  }

  return { shots, note, source };
}

/** 从段落里提取某时间段那一行的描述（去掉时间戳前缀） */
function extractShotDesc(sectionText, rawRange) {
  if (!sectionText) return "";
  const lines = sectionText.split("\n");
  for (const line of lines) {
    if (line.includes(rawRange)) {
      // 去掉时间段本身和常见分隔符，留描述
      return line.replace(rawRange, "").replace(/^[\s|｜\-·]+/, "").trim().slice(0, 120);
    }
  }
  return "";
}

// ── 逐镜提示词生成（每镜一次调用，返回 3 版本） ─────────────────

// 3 个版本（模板后期可调，这里给初始可用版）
const KLING_VERSIONS = [
  {
    name: "简洁版",
    instruction: `只写复刻这一镜必须的核心：镜头景别+运镜、场景一句、角色关键动作、本镜台词（若有）、书的关键状态（若涉书）。一段连贯口语，不堆细节。约 60-90 字。`,
  },
  {
    name: "复杂版",
    instruction: `按可灵逐镜 6 段结构完整写（融成连贯叙述，不分行编号）：
① 技术头（画幅/真实感）
② 起始画面（第一镜用「@构图参考图」；第二镜起用「以上一镜最后帧为起始画面」）
③ 场景 + 角色动作，引用 @角色图 @场景图（按需）
④ 本镜台词（完整，一字不改）
⑤ 书：动作 + 空间姿态 + 封面朝向 + 禁止翻开，引用 @道具书图（若本镜涉书）
⑥ 运镜（方向+起止角度）
约 120-160 字。`,
  },
  {
    name: "详细版",
    instruction: `在复杂版 6 段结构基础上，补：景别变化细节、角色服装（单件，适配季节）、光线一句、运镜速度感；并在**末尾**用括号标注本镜时长（如「(约 3s)」）和起止时间戳。约 160-220 字。`,
  },
];

/** 单镜位置语义，决定 @引用与起始画面写法 */
function shotPositionNote(shot, total) {
  if (shot.index === 1) {
    return `这是第 1 镜（共 ${total} 镜），起始画面用「@构图参考图」。`;
  }
  return `这是第 ${shot.index} 镜（共 ${total} 镜），起始画面写「以上一镜最后帧为起始画面」，不要再用 @构图参考图。`;
}

/**
 * 可灵逐镜提示词生成。每镜一次模型调用，返回该镜 3 个版本。
 * @param {string} aiReport
 * @param {object} opts  { shots, refImages, scriptMode, scriptData, season, date, conflictNote, onProgress }
 * @returns {Promise<{ kind:'kling', shots:Array, note:string|null }>}
 */
async function generateKlingPrompts(aiReport, opts = {}) {
  const {
    shots = [],
    refImagesNote = "",
    scriptNote = "",
    season = "",
    date = "",
    conflictNote = "",
    shotNote = null,
    onProgress = () => {},
  } = opts;

  const total = shots.length;
  const versionSpec = KLING_VERSIONS
    .map((v, i) => `版本${i + 1}「${v.name}」：${v.instruction}`)
    .join("\n\n");

  const common = `今日日期（中国标准时间）：${date}，当前季节：${season}

## 视频分析报告（全片，供理解上下文）
${aiReport}

${conflictNote ? conflictNote + "\n" : ""}${scriptNote ? `## 台词说明（优先使用，替换原台词）\n${scriptNote}\n` : ""}${refImagesNote ? `## 参考图说明\n${refImagesNote}\n` : ""}
## 可灵逐镜通用规则
- 每镜都带固定 @引用集合：@角色图、@场景图、@道具书图（按本镜是否涉及取用）
- 第一镜起始画面用 @构图参考图；第二镜起改用「以上一镜最后帧为起始画面」保证拼接
- 服装适配${season}，原视频不符直接改写，不说明原视频穿什么；服装只写单件
- 书：动作+空间姿态+封面朝向+禁止翻开，外观交参考图；不描述封面配色/文字/图案
- 不写表情/语气/坐姿等表演词；台词完整一字不改`;

  const results = [];
  // 逐镜串行（保证 onProgress 顺序 + 控制并发；单镜内 3 版一次调用拿回）
  for (const shot of shots) {
    onProgress(`生成可灵第 ${shot.index}/${total} 镜（3 版）…`);
    const timeLabel = (shot.start != null && shot.end != null)
      ? `${shot.start.toFixed(1)}s ~ ${shot.end.toFixed(1)}s`
      : "时间未知";

    const prompt = `你是可灵 AI 视频提示词专家。下面是整片分析报告，请只为**指定的这一个镜头**生成提示词，输出 3 个不同详细程度的版本。

${common}

## 本镜信息
- 镜号：第 ${shot.index} 镜（共 ${total} 镜）
- 时间段：${timeLabel}
- 本镜内容：${shot.desc || "见报告对应时间段"}
- ${shotPositionNote(shot, total)}

## 需要输出的 3 个版本
${versionSpec}

严格只输出 JSON，不要任何额外文字：
{ "versions": [ { "strategy": "简洁版", "text": "..." }, { "strategy": "复杂版", "text": "..." }, { "strategy": "详细版", "text": "..." } ] }`;

    let parsed = null;
    try {
      const raw = await callDashScope([{ type: "text", text: prompt }], { maxTokens: 1500 });
      parsed = safeJson(raw);
    } catch (e) {
      onProgress(`第 ${shot.index} 镜生成失败：${e.message}`);
    }

    const versions = (parsed && Array.isArray(parsed.versions) && parsed.versions.length)
      ? parsed.versions.map(v => ({ strategy: v.strategy || "", text: (v.text || "").trim() }))
      : KLING_VERSIONS.map(v => ({ strategy: v.name, text: "（本镜生成失败，请重试）" }));

    results.push({
      index: shot.index,
      start: shot.start,
      end: shot.end,
      desc: shot.desc || "",
      versions,
    });
  }

  return { kind: "kling", shots: results, note: shotNote };
}

/** 容错 JSON 解析（复用 accuracy 的同款逻辑，避免循环依赖单独实现） */
function safeJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a === -1 || b === -1 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

module.exports = {
  toSeconds, extractRanges, parseShots, extractShotDesc,
  generateKlingPrompts, KLING_VERSIONS,
};
