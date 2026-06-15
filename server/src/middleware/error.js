"use strict";

const { nodeEnv } = require("../config");

// 统一错误响应格式
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "服务器内部错误";

  console.error(`[ERROR] ${req.method} ${req.originalUrl} → ${status}: ${message}`);
  if (nodeEnv === "development" && err.stack) {
    console.error(err.stack);
  }

  res.status(status).json({
    success: false,
    error: {
      message,
      ...(nodeEnv === "development" && { stack: err.stack }),
    },
  });
}

// 404 兜底
function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: { message: `路由不存在: ${req.method} ${req.originalUrl}` },
  });
}

module.exports = { errorHandler, notFound };
