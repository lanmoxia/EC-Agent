"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

module.exports = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",

  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || "",
    baseUrl: process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: process.env.VISION_MODEL || "qwen3.5-omni-flash",
  },

  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || "3", 10),
  },

  upload: {
    maxMb: parseInt(process.env.UPLOAD_MAX_MB || "100", 10),
    dir: require("path").resolve(__dirname, "../uploads"),
  },

  db: {
    path: require("path").resolve(__dirname, "../../claude-vision.db"),
  },

  reports: {
    dir: require("path").resolve(__dirname, "../../reports"),
  },

  // 准确性校验（4 层，可逐层开关；任一层报错不影响主流程）
  accuracy: {
    // L1 确定性地面真值（ffprobe/ffmpeg，零模型成本，建议常开）
    groundTruth: process.env.ACCURACY_GROUND_TRUTH !== "false",
    // L2 定向复核（+1 次视频模型调用，内容准确性主力）
    recheck: process.env.ACCURACY_RECHECK !== "false",
    // L3 首帧图像接地（+1 次 vision 调用，专治第2段构图）
    firstFrame: process.env.ACCURACY_FIRST_FRAME !== "false",
    // L4 台账文件（追加写 accuracy-issues.md）
    ledger: process.env.ACCURACY_LEDGER !== "false",
    ledgerPath: process.env.ACCURACY_LEDGER_PATH
      || require("path").resolve(__dirname, "../../accuracy-issues.md"),
  },
};
