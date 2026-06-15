#!/usr/bin/env node
/**
 * 视频分析脚本 v2 — 默认直接把视频喂给 qwen3.5-omni-plus
 * （原生多模态：能听音频、看口型、感知运镜和节奏）。
 * 保留抽帧路径作为降级模式。
 *
 * 用法:
 *   node video.js <视频路径> [问题]               # 默认 video 模式（推荐）
 *   node video.js --url <视频URL> [问题]          # 视频已在公网 URL
 *   node video.js --frames [N] <视频路径> [问题]  # 降级抽帧模式
 *   额外标志: --keep （抽帧模式下保留临时帧目录）
 *
 * 模式选择:
 *   - video（默认）：精度最高，能听台词、看口型、感知节奏；inline 上限 ~50MB
 *   - --url：视频已在公网（如 OSS）时用，避开 base64 膨胀和 size 上限
 *   - --frames：视频过大 / 网络差 / 想省 token 时降级；只看静态帧序列
 *
 * 依赖:
 *   ffmpeg + ffprobe（仅 --frames 模式需要）
 *   DASHSCOPE_API_KEY / VISION_MODEL 同 vision.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const http = require("http");
const { execSync } = require("child_process");

try { require("dotenv").config(); } catch {}
try { require("dotenv").config({ path: path.resolve(__dirname, ".env") }); } catch {}

const BASE_URL = process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const API_KEY = process.env.DASHSCOPE_API_KEY || "sk-e5131436614d42d5bd84d6bd0544a446";
const MODEL = process.env.VISION_MODEL || "qwen3.5-omni-plus";

const MAX_INLINE_SIZE = 50 * 1024 * 1024;

function parseArgs() {
  const argv = process.argv.slice(2);
  let video = "", prompt = "", frames = 0, mode = "video", isUrl = false, keep = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--frames") {
      mode = "frames";
      const next = argv[i + 1];
      if (next && /^\d+$/.test(next)) { frames = parseInt(next, 10); i++; }
    } else if (a === "--url") {
      isUrl = true;
      if (argv[i + 1]) video = argv[++i];
    } else if (a === "--keep") {
      keep = true;
    } else if (!video && !a.startsWith("--")) {
      video = a;
    } else if (video && !a.startsWith("--")) {
      prompt = prompt ? prompt + " " + a : a;
    }
  }
  if (!prompt) {
    prompt = "请按时间顺序综合描述这个视频：主要内容、人物外观、场景环境、" +
             "动态变化、镜头运动、台词内容、语气情绪。如果有对白，请转录每句话。";
  }
  return { video, prompt, frames, mode, isUrl, keep };
}

function videoMime(file) {
  const ext = path.extname(file).toLowerCase().replace(".", "");
  const map = { mp4: "mp4", mov: "quicktime", mkv: "x-matroska", webm: "webm", avi: "x-msvideo", m4v: "mp4" };
  return `video/${map[ext] || "mp4"}`;
}

function toVideoDataUrl(file) {
  const stat = fs.statSync(file);
  if (stat.size > MAX_INLINE_SIZE) {
    throw new Error(
      `视频过大（${(stat.size / 1024 / 1024).toFixed(1)}MB > 50MB），不建议 inline 上传。\n` +
      `  建议: ① 把视频传到公网（OSS / 七牛 / S3），用 --url 模式\n` +
      `       ② 用 --frames 模式降级抽帧分析`
    );
  }
  const data = fs.readFileSync(file);
  return `data:${videoMime(file)};base64,${data.toString("base64")}`;
}

function imageMime(file) {
  const ext = path.extname(file).toLowerCase().replace(".", "");
  const map = { jpg: "jpeg", jpeg: "jpeg", png: "png", webp: "webp" };
  return `image/${map[ext] || "jpeg"}`;
}

function toImageDataUrl(file) {
  const data = fs.readFileSync(file);
  return `data:${imageMime(file)};base64,${data.toString("base64")}`;
}

function probeDuration(file) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`
  ).toString().trim();
  const d = parseFloat(out);
  if (!isFinite(d) || d <= 0) throw new Error(`无法读取视频时长: ${file}`);
  return d;
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

function request(payload) {
  const url = new URL(BASE_URL.replace(/\/?$/, "/") + "chat/completions");
  const body = JSON.stringify(payload);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`API ${res.statusCode}: ${data.slice(0, 500)}`));
        }
        try {
          resolve(JSON.parse(data)?.choices?.[0]?.message?.content || data);
        } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function runVideoMode({ video, prompt, isUrl }) {
  const videoUrl = isUrl ? video : toVideoDataUrl(video);
  const sizeHint = isUrl ? video : `${(fs.statSync(video).size / 1024 / 1024).toFixed(2)}MB inline`;
  console.error(`视频模式（多模态原生）: ${sizeHint}`);

  const payload = {
    model: MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "video_url", video_url: { url: videoUrl } },
        { type: "text", text: prompt },
      ],
    }],
    stream: false,
    max_tokens: 4000,
  };
  return await request(payload);
}

async function runFramesMode({ video, prompt, frames, keep }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-frames-"));
  try {
    const { paths, duration, count } = extractFrames(video, frames, tmpDir);
    console.error(`抽帧降级模式: 视频 ${duration.toFixed(2)}s，抽 ${count} 帧分析（无音频）`);
    const content = paths.map((p) => ({
      type: "image_url",
      image_url: { url: toImageDataUrl(p) },
    }));
    content.push({
      type: "text",
      text: `这是同一个视频按时间顺序抽出的 ${count} 帧（从开头到结尾）。${prompt}`,
    });
    const result = await request({
      model: MODEL,
      messages: [{ role: "user", content }],
      stream: false,
      max_tokens: 4000,
    });
    if (keep) console.error(`帧已保留: ${tmpDir}`);
    return result;
  } finally {
    if (!keep) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs();
  const { video, mode, isUrl } = args;

  if (!video) {
    console.error("用法:");
    console.error("  node video.js <视频路径> [问题]                # 默认视频模式");
    console.error("  node video.js --url <视频URL> [问题]           # 公网 URL 视频");
    console.error("  node video.js --frames [N] <视频路径> [问题]   # 降级抽帧模式");
    console.error("  额外: --keep （抽帧模式下保留临时帧）");
    process.exit(1);
  }
  if (!isUrl && !fs.existsSync(video)) {
    console.error(`文件不存在: ${video}`);
    process.exit(1);
  }

  try {
    const result = mode === "frames" ? await runFramesMode(args) : await runVideoMode(args);
    console.log(result);
  } catch (err) {
    console.error("视频分析失败:", err.message);
    if (mode === "video" && /400|video_url|format|unsupported/i.test(err.message)) {
      console.error("\n提示：视频模式失败，可能是接口字段或模型版本不兼容。");
      console.error("尝试降级到抽帧: node video.js --frames <视频路径> [问题]");
    }
    process.exit(1);
  }
}

main();
