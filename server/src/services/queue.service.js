"use strict";

const config = require("../config");
const analysisService = require("./analysis.service");

// ── 状态 ──────────────────────────────────────────────────────────

const pending = [];       // 待处理的 taskId 队列
let active = 0;           // 当前正在处理的任务数

// SSE 订阅表：taskId → Set<callback>
// callback 签名：(event: { type: string, payload: object }) => void
const subscribers = new Map();

// ── 内部工具 ──────────────────────────────────────────────────────

function emit(taskId, type, payload) {
  const subs = subscribers.get(taskId);
  if (subs && subs.size > 0) {
    const event = { type, payload };
    for (const cb of subs) {
      try { cb(event); } catch { /* 忽略单个订阅者异常 */ }
    }
  }
}

async function process(taskId) {
  active++;
  try {
    emit(taskId, "progress", { message: "任务开始处理…" });

    const report = await analysisService.run(taskId, (message) => {
      emit(taskId, "progress", { message });
    });

    emit(taskId, "done", { reportId: report.id });
  } catch (err) {
    emit(taskId, "error", { message: err.message });
  } finally {
    active--;
    drain(); // 处理完一个，尝试处理下一个
  }
}

function drain() {
  const concurrency = config.queue.concurrency;
  while (active < concurrency && pending.length > 0) {
    const taskId = pending.shift();
    process(taskId);
  }
}

// ── 公开 API ──────────────────────────────────────────────────────

/**
 * 将任务加入队列。
 */
function enqueue(taskId) {
  pending.push(taskId);
  drain();
}

/**
 * 订阅某个任务的事件。
 * @returns {Function} unsubscribe 函数
 */
function subscribe(taskId, callback) {
  if (!subscribers.has(taskId)) {
    subscribers.set(taskId, new Set());
  }
  subscribers.get(taskId).add(callback);

  return function unsubscribe() {
    const subs = subscribers.get(taskId);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) subscribers.delete(taskId);
    }
  };
}

/**
 * 当前队列状态（供监控用）。
 */
function status() {
  return { pending: pending.length, active, concurrency: config.queue.concurrency };
}

module.exports = { enqueue, subscribe, status };
