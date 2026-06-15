"use strict";

const router = require("express").Router();
const queueService = require("../services/queue.service");

// GET /api/sse/:taskId — SSE 进度推送
// 客户端用 EventSource('/api/sse/<taskId>') 订阅
router.get("/:taskId", (req, res) => {
  const { taskId } = req.params;

  // SSE 响应头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // 禁用 nginx 缓冲
  res.flushHeaders();

  // 注册监听
  const unsubscribe = queueService.subscribe(taskId, (event) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.payload)}\n\n`);
  });

  // 心跳，防止代理超时断连（每 20s 一次）
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 20_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

module.exports = router;
