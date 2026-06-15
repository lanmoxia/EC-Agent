#!/usr/bin/env node
/**
 * 时间轴结构校验 — 配合 video.js 分析报告使用
 *
 * 用法:
 *   node validate.js <视频路径> <报告路径>              # 校验报告文件
 *   node video.js <视频路径> | node validate.js <视频路径>  # 管道模式（stdin 读报告）
 *
 * 退出码:
 *   0 = 通过（含仅警告）
 *   1 = 有错误（需修正）
 */

const fs = require("fs");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const videoPath = args[0];
const reportPath = args[1];

if (!videoPath) {
  console.error("用法: node validate.js <视频路径> [报告路径]");
  process.exit(1);
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

function toSeconds(timeStr) {
  timeStr = timeStr.trim();
  if (timeStr.includes(":")) {
    const [min, sec] = timeStr.split(":");
    return parseInt(min, 10) * 60 + parseFloat(sec);
  }
  return parseFloat(timeStr);
}

function extractTimestamps(text) {
  const results = [];
  // 匹配 0:05.2-0:08.7 / 0:05～0:08 / 0:05—0:08 / 0:05.2–0:08.7
  const pattern = /(\d{1,2}:\d{2}(?:\.\d+)?)\s*[～~—\-–→至到]\s*(\d{1,2}:\d{2}(?:\.\d+)?)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const start = toSeconds(match[1]);
    const end = toSeconds(match[2]);
    if (isFinite(start) && isFinite(end)) {
      results.push({ start, end, raw: match[0] });
    }
  }
  return results;
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

async function main() {
  let reportText = "";
  if (reportPath && fs.existsSync(reportPath)) {
    reportText = fs.readFileSync(reportPath, "utf8");
  } else {
    reportText = await readStdin();
  }

  const issues = [];
  const warnings = [];

  // 获取视频实际时长
  const actualDuration = probeDuration(videoPath);
  if (actualDuration === null) {
    warnings.push("ffprobe 不可用，跳过时长校验");
  } else {
    process.stderr.write(`视频时长：${actualDuration.toFixed(1)}s\n`);
  }

  if (!reportText.trim()) {
    warnings.push("未提供报告内容，仅获取视频时长");
  } else {
    // 只解析第3段（时间轴台词），避免把分镜建议等大段范围误抓进来
    const sec3Match = reportText.match(/##\s*3[\.．][\s\S]*?(?=##\s*4[\.．]|$)/);
    const sec3Text = sec3Match ? sec3Match[0] : reportText;
    const allTs = extractTimestamps(sec3Text);
    const timestamps = actualDuration
      ? allTs.filter(t => !(t.start < 1 && (t.end / actualDuration) >= 0.9))
      : allTs;

    if (timestamps.length === 0) {
      warnings.push("报告中未检测到时间戳（MM:SS 格式），无法进行时间轴校验");
    } else {
      process.stderr.write(`检测到 ${timestamps.length} 个时间段\n`);

      for (let i = 0; i < timestamps.length; i++) {
        const t = timestamps[i];

        // 起止倒序
        if (t.start >= t.end) {
          issues.push(`起止倒序：${t.raw}`);
          continue;
        }

        // 与上一段重叠
        if (i > 0) {
          const prev = timestamps[i - 1];
          if (t.start < prev.end - 0.3) {
            issues.push(
              `时间重叠：${prev.raw} 与 ${t.raw}（重叠 ${(prev.end - t.start).toFixed(1)}s）`
            );
          }
        }

        // 与下一段之间有较长空白
        if (i < timestamps.length - 1) {
          const next = timestamps[i + 1];
          const gap = next.start - t.end;
          if (gap > 4) {
            warnings.push(
              `台词空白 ${gap.toFixed(1)}s（${t.end.toFixed(1)}s ～ ${next.start.toFixed(1)}s），确认是静默还是遗漏`
            );
          }
        }
      }

      if (actualDuration !== null) {
        const firstStart = timestamps[0].start;
        const lastEnd = timestamps[timestamps.length - 1].end;
        const tail = actualDuration - lastEnd;

        // 首段开始太晚
        if (firstStart > 3) {
          warnings.push(
            `首条台词从 ${firstStart.toFixed(1)}s 开始，开头 ${firstStart.toFixed(1)}s 无记录，复核是否有开场台词`
          );
        }

        // 末尾时间戳超出视频时长
        if (lastEnd > actualDuration + 1.0) {
          issues.push(
            `时间戳 ${lastEnd.toFixed(1)}s 超出视频时长 ${actualDuration.toFixed(1)}s`
          );
        } else if (tail > 5) {
          // 末尾有较长无台词段
          warnings.push(
            `末尾 ${tail.toFixed(1)}s 无台词记录（${lastEnd.toFixed(1)}s ～ ${actualDuration.toFixed(1)}s），复核末段是否遗漏`
          );
        }
      }
    }
  }

  // 输出结果
  console.log("\n=== 时间轴校验 ===");
  if (issues.length === 0 && warnings.length === 0) {
    console.log("✅ 通过");
  } else {
    if (issues.length > 0) {
      console.log(`\n❌ 错误（${issues.length} 项，需修正）：`);
      issues.forEach((msg) => console.log(`  · ${msg}`));
    }
    if (warnings.length > 0) {
      console.log(`\n⚠️  警告（${warnings.length} 项，需人工确认）：`);
      warnings.forEach((msg) => console.log(`  · ${msg}`));
    }
  }

  process.exit(issues.length > 0 ? 1 : 0);
}

main();
