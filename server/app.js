"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");

const config = require("./src/config");
const logger = require("./src/middleware/logger");
const { errorHandler, notFound } = require("./src/middleware/error");

// 确保 uploads 目录存在
if (!fs.existsSync(config.upload.dir)) {
  fs.mkdirSync(config.upload.dir, { recursive: true });
}

const app = express();

// ── 基础中间件 ────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP 关闭，内部工具不需要
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(logger);

// ── API 路由（占位，Phase 3-5 补充） ──────────────────────────
app.use("/api/tasks", require("./src/routes/tasks.route"));
app.use("/api/reports", require("./src/routes/reports.route"));
app.use("/api/accounts", require("./src/routes/accounts.route"));
app.use("/api/sse", require("./src/routes/sse.route"));
app.use("/api/system", require("./src/routes/system.route"));

// ── 健康检查 ──────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// ── 静态前端（生产模式） ───────────────────────────────────────
if (config.nodeEnv === "production") {
  const distPath = path.resolve(__dirname, "../client/dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
}

// ── 错误处理 ──────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── 启动 ──────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`\n🚀 Server running on http://localhost:${config.port}`);
  console.log(`   环境: ${config.nodeEnv}`);
  console.log(`   数据库: ${config.db.path}`);
  console.log(`   上传目录: ${config.upload.dir}\n`);
});

module.exports = app;
