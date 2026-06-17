"use strict";

const { execSync } = require("child_process");

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

/**
 * 校验分析报告的时间轴结构。
 * @param {string} videoPath    视频文件路径（用于 ffprobe 获取时长）
 * @param {string} reportText   分析报告文本
 * @returns {{pass: boolean, issues: string[], warnings: string[], duration: number|null}}
 */
function validateTimeline(videoPath, reportText) {
  const issues = [];
  const warnings = [];

  const actualDuration = probeDuration(videoPath);
  if (actualDuration === null) {
    warnings.push("ffprobe 不可用，跳过时长校验");
  }

  if (!reportText.trim()) {
    return { pass: true, issues, warnings: [...warnings, "报告内容为空"], duration: actualDuration };
  }

  // 只解析第5段（时间轴台词）——9段规范里台词在§5，§3是角色外观
  const sec5Match = reportText.match(/##\s*5[\.．][\s\S]*?(?=##\s*6[\.．]|$)/);
  const sec5Text = sec5Match ? sec5Match[0] : reportText;
  const allTs = extractTimestamps(sec5Text);
  const timestamps = actualDuration
    ? allTs.filter((t) => !(t.start < 1 && t.end / actualDuration >= 0.9))
    : allTs;

  if (timestamps.length === 0) {
    warnings.push("未检测到时间戳（MM:SS 格式），无法校验时间轴");
    return { pass: issues.length === 0, issues, warnings, duration: actualDuration };
  }

  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];

    if (t.start >= t.end) {
      issues.push(`起止倒序：${t.raw}`);
      continue;
    }

    if (i > 0) {
      const prev = timestamps[i - 1];
      if (t.start < prev.end - 0.3) {
        issues.push(`时间重叠：${prev.raw} 与 ${t.raw}（重叠 ${(prev.end - t.start).toFixed(1)}s）`);
      }
    }

    if (i < timestamps.length - 1) {
      const next = timestamps[i + 1];
      const gap = next.start - t.end;
      if (gap > 4) {
        warnings.push(`台词空白 ${gap.toFixed(1)}s（${t.end.toFixed(1)}s ～ ${next.start.toFixed(1)}s），确认是静默还是遗漏`);
      }
    }
  }

  if (actualDuration !== null && timestamps.length > 0) {
    const firstStart = timestamps[0].start;
    const lastEnd = timestamps[timestamps.length - 1].end;
    const tail = actualDuration - lastEnd;

    if (firstStart > 3) {
      warnings.push(`首条台词从 ${firstStart.toFixed(1)}s 开始，开头 ${firstStart.toFixed(1)}s 无记录，复核是否有开场台词`);
    }
    if (lastEnd > actualDuration + 1.0) {
      issues.push(`时间戳 ${lastEnd.toFixed(1)}s 超出视频时长 ${actualDuration.toFixed(1)}s`);
    } else if (tail > 5) {
      warnings.push(`末尾 ${tail.toFixed(1)}s 无台词记录（${lastEnd.toFixed(1)}s ～ ${actualDuration.toFixed(1)}s），复核末段是否遗漏`);
    }
  }

  return {
    pass: issues.length === 0,
    issues,
    warnings,
    duration: actualDuration,
  };
}

module.exports = { validateTimeline };
