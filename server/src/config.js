"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

module.exports = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",

  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || "",
    baseUrl: process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: process.env.VISION_MODEL || "qwen3.5-omni-plus",
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
};
