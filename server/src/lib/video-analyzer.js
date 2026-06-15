"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const { callDashScope } = require("./dashscope");

const MAX_INLINE_SIZE = 50 * 1024 * 1024; // 50MB

// ── MIME ─────────────────────────────────────────────────────────

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

// ── Base64 编码 ───────────────────────────────────────────────────

function toVideoDataUrl(file) {
  const stat = fs.statSync(file);
  if (stat.size > MAX_INLINE_SIZE) {
    throw Object.assign(
      new Error(`视频过大（${(stat.size / 1024 / 1024).toFixed(1)}MB > 50MB），请先压缩后重试`),
      { code: "FILE_TOO_LARGE", sizeMb: stat.size / 1024 / 1024 }
    );
  }
  const data = fs.readFileSync(file);
  return `data:${videoMime(file)};base64,${data.toString("base64")}`;
}

function toImageDataUrl(file) {
  const data = fs.readFileSync(file);
  return `data:${imageMime(file)};base64,${data.toString("base64")}`;
}

// ── ffmpeg 工具 ───────────────────────────────────────────────────

/**
 * 用 ffmpeg 压缩视频，保留音频，返回压缩后的文件路径。
 * 压缩策略来自 CLAUDE.md：crf 28 → crf 32 → 放弃压缩
 */
function compressVideo(inputPath, crf, onProgress) {
  const base = path.basename(inputPath, path.extname(inputPath));
  const outPath = path.join(path.dirname(inputPath), `${base}_crf${crf}.mp4`);
  onProgress(`ffmpeg 压缩中（crf ${crf}），保留音频…`);
  execSync(
    `ffmpeg -y -i "${inputPath}" -c:v libx264 -crf ${crf} -preset fast -c:a aac -b:a 96k "${outPath}"`,
    { stdio: "pipe" }
  );
  return outPath;
}

function enhanceAudio(inputPath, onProgress) {
  const base = path.basename(inputPath, path.extname(inputPath));
  const outPath = path.join(path.dirname(inputPath), `${base}_voice.mp4`);
  onProgress("音轨增强中（降噪 + 人声频段滤波）…");
  execSync(
    `ffmpeg -y -i "${inputPath}" -af "afftdn=nf=-20,highpass=f=150,lowpass=f=4000" "${outPath}"`,
    { stdio: "pipe" }
  );
  return outPath;
}

function modelCannotHear(text) {
  return /听不到|无法听到|听不清|音频不可用|无法识别音频|没有声音|音频无法|audio.*unavail/i.test(text);
}

function probeDuration(file) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    const d = parseFloat(out);
    return isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}

function pickFrameCount(duration, requested) {
  if (requested > 0) return Math.min(requested, 12);
  if (duration <= 3) return 3;
  if (duration <= 10) return 4;
  if (duration <= 30) return 6;
  if (duration <= 120) return 8;
  return 10;
}

function extractFrames(file, requested, outDir) {
  const duration = probeDuration(file);
  if (!duration) throw new Error("无法读取视频时长（ffprobe 不可用）");
  const count = pickFrameCount(duration, requested);
  const paths = [];
  for (let i = 0; i < count; i++) {
    const t = (duration * (i + 0.5)) / count;
    const out = path.join(outDir, `frame_${String(i + 1).padStart(2, "0")}.jpg`);
    execSync(
      `ffmpeg -y -ss ${t.toFixed(3)} -i "${file}" -frames:v 1 -q:v 3 "${out}"`,
      { stdio: "pipe" }
    );
    paths.push(out);
  }
  return { paths, duration, count };
}

// ── 用户补充信息注入 ──────────────────────────────────────────────

const LABEL_NAMES = {
  character:       "角色参考图",
  scene_clean:     "干净场景图",
  scene_with_char: "有角色的场景图",
  book:            "道具书参考图",
};

function buildInjection({ refImages = [], scriptMode = null, scriptData = null }) {
  const parts = [];

  if (refImages.length) {
    const lines = ["参考图（已随视频一并发送，提示词中按以下类型引用）："];
    refImages.forEach(r => {
      lines.push(`- ${LABEL_NAMES[r.label] || "未标注参考图"}`);
    });
    parts.push(lines.join("\n"));
  }

  if (scriptMode && scriptData) {
    const lines = ["台词（直接使用以下版本，不用视频中的台词）："];
    if (scriptMode === "single") {
      if (scriptData.text) lines.push(scriptData.text);
    } else if (scriptMode === "multi") {
      (scriptData.lines || []).forEach(l => {
        if (l.text) lines.push(`${l.speaker || "人物"}说："${l.text}"`);
      });
    } else if (scriptMode === "voiceover") {
      if (scriptData.onscreen)  lines.push(`画内：${scriptData.onscreen}`);
      if (scriptData.voiceover) lines.push(`画外音：${scriptData.voiceover}`);
    }
    if (lines.length > 1) parts.push(lines.join("\n"));
  }

  if (!parts.length) return "";
  return "\n\n--- 用户补充信息 ---\n" + parts.join("\n\n");
}

// ── 分析提示词（固定，来自 CLAUDE.md 规范） ───────────────────────

const ANALYSIS_PROMPT_BASE = `请严格按以下9段结构输出视频分析报告，每段必填，不跳段不省略，尽可能详细：

【声部摘要】一句话描述声部结构，例：声部：画外女问 → 画内女答；或：声部：单人画内口播

## 1. 视频基础信息
- 总时长（精确到0.1s）
- 画幅比例（如9:16竖版/16:9横版）
- 拍摄类型（真人口播/户外跟拍/室内固定机位等）
- 镜头数量，是否一镜到底：★必须仔细判断有无【硬切】★。哪怕机位、景别、背景看起来一样，只要画面内容发生了瞬间跳变（例如：手里的书从"闭合封面"瞬间变成"翻开的内页"、人物姿态/手部位置瞬间不连贯、道具瞬间出现或改变形态），就是发生了硬切，属于多个分镜，不要误判成"一镜到底"。请写明：共几个分镜；若有硬切，逐个分镜说明（分镜N：画面主要内容是什么），并指出硬切发生在第几秒、对应哪句台词。
- 整体拍摄质感（手机随手拍/专业摄影/稳定器等）

## 2. 第一帧精确构图
描述视频第0秒时的画面静态布局，这是最重要的段落，必须写全：
- 路/步道/地面的2D动线方向（如"路从左下→右上斜向延伸"，必须同时写上下+左右）
- 画面前景/中景/背景各层有什么，分别在哪个象限（用上下+左右同时描述）
- 角色在画面中的位置、占画比（如"人物在画面左下1/3，约占画高2/3"）
- 角色朝向和面对方向
- 镜头起始机位（正面/侧面/后侧45度等）
- 角色第0秒的初始体态：是走路中/静止站立/说话状态，有无明显站姿特征（如微侧身/正对镜头/低头等）

## 3. 角色外观档案
每个出现的人物单独一条，必须包含：
- 视觉年龄（具体数字范围，如"35岁左右"，不写"成年女性"这种模糊描述）
- 面容气质：五官风格（如"五官普通匀称，日常感，非模特外形"；或"面容清秀，气质自然亲切"），面部整洁程度，有无特别突出的五官特征
- 发型：长度（过肩/齐肩/短发）、颜色、是否有刘海、是否扎起
- 服装逐件列出（每件单独一行）：颜色+款式+材质感（如"亮橙色针织开衫，宽松版型"）
- 下装：颜色+款式
- 鞋子：颜色+类型
- 包/配饰（如有）
- 皮肤色调
- 体型/身高感（高挑/娇小/普通等）、身材比例（上下身比例、肩宽感）
- 典型站姿/体态：视频中角色最常见的姿势（如"习惯微侧身站立，重心偏左"/"走路步幅中等，上身自然放松"）
- 人物占画比和在画面中的相对位置

多人视频额外写：
- 两人的相对位置（谁在左/右/前/后）
- 互动方式（面对面/并排/一前一后）

## 4. 光线与色调
- 光源类型（自然光/室内灯/混合）
- 光线方向（从哪个方向打来，如"从右后侧斜入"）
- 光线质感（硬光/软光/漫射）
- 有无明显轮廓光/逆光/阴影
- 色温：具体描述（如"接近日落暖光，橙黄为主" 而非只写"偏暖"）
- 饱和度：高/中/低，加一句具体感受（如"颜色鲜艳但不荧光"）
- 主色块：画面里占面积最大的1-3个颜色，及其大致所在位置（如"橙色上衣占左侧1/3，绿色植被占右上背景"）
- 整体视觉风格一句话（如"日系清透感" "真实普通生活感"）
- 天气/时段线索（晴天/阴天/傍晚/正午，室外视频必填）
- 背景虚实：背景清晰还是虚化，景深程度

## 5. 时间轴台词
格式：起止时间 | 说话人 | 画内/画外 | "台词原文，停顿用//标在词语中间，换气用/标"（语气 语速）
- 时间精确到0.1s，格式 M:SS.s-M:SS.s
- 语气只用低强度词：自然说话/轻微疑问/轻微推荐/随口一提
- 语速：偏快/正常/偏慢
- 停顿示例："这本书啊//真的很适合//小学生"（//是明显停顿，/是短暂换气）
- 开头和结尾各3秒务必仔细听，不要漏掉

## 6. 动作与道具时序
按时间轴逐条列出，格式：时间点 | 动作描述 | 道具状态（如有）
- 动作只描述五官、手部、身体的具体物理动作，不做情绪判断
- 道具（尤其是书）每次状态变化都单独记录：
  持握方式（单手/双手/哪只手）+ 书在画面中的空间位置 + 书脊/封面朝向 + 倾斜角度
- ★若书的状态发生了【瞬间跳变】（闭合→翻开、封面→内页），不要写成"全程打开"或"全程闭合"，
  必须分两条记录跳变前后的状态，并注明这是硬切造成的（如：硬切前=闭合封面朝镜头；硬切后=翻开内页朝镜头）。
  绝对不要因为前后都是"拿着书"就合并成一个状态。
- 步态：移动速度感（慢步/正常步速/快步）、步伐大小、走路姿势特征
- 手势细节：哪只手、手指张开/握拳/指向等

## 7. 镜头运动时序
格式：时间段 | 镜头类型 | 运动向量 | 景别
- 运动向量要有方向+速度感（如"从右后45度缓慢推进转正面，匀速，约2秒完成"）
- 景别变化如有，写清楚从什么景别变到什么景别
- 是否有明显的镜头抖动（手持晃动感强/稳/完全稳定）
- 推/拉/平移/跟拍/固定，不要只写类型，要写运动的起点和终点角度。如有镜头前推/后拉，必须写出来，不要漏。
- ★若§1判断有硬切，这里必须把硬切点作为镜头分段的边界单独列出（如：0:00-0:02 分镜1固定中景；0:02处硬切；0:02-0:05 分镜2固定近景拍翻开内页）。

## 8. 场景与背景细节
- 场景类型（小区路边/室内卧室/商场等）
- 背景各层的具体元素，按前/中/远景分别列出，每个元素写出它在画面的象限位置
- 地面材质（水泥/砖路/草地/木地板等）
- 是否有遮挡物、建筑、绿植、护栏等固定道具，各自在画面哪个位置
- 背景有无行人/车辆等动态元素
- 场景整体空间感（开阔/局促/纵深感强等）

## 9. 复刻风险提示
- 双人互动同框的难点
- 手部动作/持书动作的复刻难度
- 台词密度风险（台词太多/太快导致口型不同步）
- 镜头运动复刻难度
- 时长是否超出豆包10s上限
- 其他容易出错的细节

---
输出规范：
- 不输出屏幕字幕/贴纸/促销文案/装饰特效
- 不写背景音乐内容
- 不使用"温馨""生动""充满活力"等主观情绪形容词
- 道具书不描述封面配色/文字/图案
- 每段标题用 ## N. 格式，子项用 - 列出`;

// buildAnalysisPrompt: Qwen 只负责感知（1-6段），提示词由独立 AI 调用生成
function buildAnalysisPrompt() {
  return ANALYSIS_PROMPT_BASE;
}

// ── 主导出函数 ────────────────────────────────────────────────────

/**
 * 分析视频，返回 AI 报告文本。
 * @param {string}   videoPath    本地视频文件路径
 * @param {object}   [opts]
 * @param {string}   [opts.platform='douban']  平台（douban/kling），决定是否输出第7段提示词
 * @param {boolean}  [opts.framesMode=false]  强制抽帧降级
 * @param {number}   [opts.frameCount=0]      抽帧数（0=自动）
 * @param {Function} [opts.onProgress]         进度回调 (message: string) => void
 * @returns {Promise<string>}  分析报告文本
 */
async function analyzeVideo(videoPath, opts = {}) {
  const {
    platform = "douban",
    framesMode = false,
    frameCount = 0,
    onProgress = () => {},
    refImages = [],
    scriptMode = null,
    scriptData = null,
  } = opts;

  // 注入 ffprobe 实测时长（供 Qwen 在时间轴对齐时参考）
  const actualDuration = probeDuration(videoPath);
  const durationHint = actualDuration
    ? `视频实际时长（ffprobe 实测）：${actualDuration.toFixed(1)}s，请以此为准。\n\n`
    : "";

  const injection = buildInjection({ refImages, scriptMode, scriptData });
  const prompt = durationHint + buildAnalysisPrompt() + injection;

  // 参考图 content items（发送到模型前置）
  const refImageItems = refImages
    .filter(r => r.path && fs.existsSync(r.path))
    .map(r => ({ type: "image_url", image_url: { url: toImageDataUrl(r.path) } }));

  if (!framesMode) {
    // ── 直传模式 ────────────────────────────────────────────────
    try {
      const sizeMb = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(2);
      onProgress(`视频直传模式（${sizeMb}MB），调用 Qwen 多模态分析…`);

      const videoUrl = toVideoDataUrl(videoPath);
      let result = await callDashScope([
        ...refImageItems,
        { type: "video_url", video_url: { url: videoUrl } },
        { type: "text", text: prompt },
      ]);

      // 模型报告听不到音频 → 音轨增强后重试一次
      if (modelCannotHear(result)) {
        onProgress("模型报告听不到音频，尝试音轨增强后重跑…");
        try {
          const enhanced = enhanceAudio(videoPath, onProgress);
          const enhancedUrl = toVideoDataUrl(enhanced);
          const retryResult = await callDashScope([
            ...refImageItems,
            { type: "video_url", video_url: { url: enhancedUrl } },
            { type: "text", text: prompt },
          ]);
          if (!modelCannotHear(retryResult)) {
            onProgress("音轨增强后重新分析完成 ✓");
            return retryResult;
          }
          onProgress("⚠ 音轨增强后仍无法识别，继续使用原结果（台词段精度有限）");
        } catch {
          onProgress("⚠ 音轨增强失败，继续使用原分析结果");
        }
      }

      onProgress("分析完成");
      return result;
    } catch (err) {
      const isSizeErr = err.code === "FILE_TOO_LARGE" || /400|video_url|format|unsupported/i.test(err.message);
      if (!isSizeErr) throw err;

      // ── 压缩降级（保留音频，优先于抽帧）──────────────────────────
      const crfList = [28, 32];
      for (const crf of crfList) {
        try {
          const compressed = compressVideo(videoPath, crf, onProgress);
          const compressedMb = fs.statSync(compressed).size / 1024 / 1024;
          onProgress(`压缩完成（crf ${crf}，${compressedMb.toFixed(1)}MB），重新直传…`);

          if (compressedMb <= 50) {
            const videoUrl = toVideoDataUrl(compressed);
            const result = await callDashScope([
              ...refImageItems,
              { type: "video_url", video_url: { url: videoUrl } },
              { type: "text", text: prompt },
            ]);
            onProgress("压缩直传分析完成");
            return result;
          }
        } catch {
          onProgress(`crf ${crf} 压缩后仍失败，继续尝试…`);
        }
      }

      // 压缩仍无效 → 最终降级抽帧
      onProgress("压缩后仍无法直传，降级抽帧（丢失音频，精度有限）…");
      return analyzeVideo(videoPath, { ...opts, framesMode: true });
    }
  }

  // ── 抽帧降级模式 ──────────────────────────────────────────────
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vframes-"));
  try {
    onProgress("抽帧降级模式：提取关键帧…");
    const { paths, duration, count } = extractFrames(videoPath, frameCount, tmpDir);
    onProgress(`已抽取 ${count} 帧（视频 ${duration.toFixed(1)}s），调用 Qwen 分析…`);

    const frameItems = paths.map(p => ({ type: "image_url", image_url: { url: toImageDataUrl(p) } }));
    const result = await callDashScope([
      ...refImageItems,
      ...frameItems,
      {
        type: "text",
        text: `这是同一个视频按时间顺序抽出的 ${count} 帧（从开头到结尾，无音频）。\n\n${prompt}\n\n注意：此为抽帧模式，无法分析音频台词，台词部分请标注"音频不可用"。`,
      },
    ]);
    onProgress("抽帧分析完成");
    return result;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { analyzeVideo };
