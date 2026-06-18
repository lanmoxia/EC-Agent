"use strict";

const router = require("express").Router();
const { nanoid } = require("nanoid");
const ReportModel = require("../models/report.model");
const CaseModel    = require("../models/case.model");
const ReviewModel  = require("../models/review.model");
const ExperimentModel = require("../models/experiment.model");
const config       = require("../config");
const fs           = require("fs");
const path         = require("path");

// 经验日志固定写到项目根（不再硬编码 E:/claude-vision-skill；旧路径会静默失败）
const EXP_FILE = path.join(path.dirname(config.reports.dir), "prompt-experiments.md");

// GET /api/reports — 报告列表（分页）
router.get("/", (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
    const result = ReportModel.list({ page, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/:id — 单个报告详情
router.get("/:id", (req, res, next) => {
  try {
    const report = ReportModel.findById(req.params.id);
    if (!report) throw Object.assign(new Error("报告不存在"), { status: 404 });
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/by-task/:taskId — 通过任务ID查报告
router.get("/by-task/:taskId", (req, res, next) => {
  try {
    const report = ReportModel.findByTaskId(req.params.taskId);
    if (!report) throw Object.assign(new Error("报告不存在"), { status: 404 });
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
});

// PUT /api/reports/:id — 更新报告内容（ai_report / human_summary / doubao_prompt）
router.put("/:id", (req, res, next) => {
  try {
    const report = ReportModel.findById(req.params.id);
    if (!report) throw Object.assign(new Error("报告不存在"), { status: 404 });
    const { ai_report, human_summary, doubao_prompt } = req.body;
    const updated = ReportModel.update(req.params.id, {
      aiReport:     ai_report,
      humanSummary: human_summary,
      doubaoPrompt: doubao_prompt,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// POST /api/reports/:id/compare-analyze — 自动对比两份分析报告，输出差异列表
router.post("/:id/compare-analyze", async (req, res, next) => {
  try {
    const { comparisonReport, comparisonReportId } = req.body;
    if (!comparisonReport) {
      throw Object.assign(new Error("缺少生成视频分析报告（comparisonReport）"), { status: 400 });
    }
    const { compareAnalyze } = require("../services/analysis.service");
    const failureAnalysis = await compareAnalyze(req.params.id, { comparisonReport });
    // 存入对比报告的 human_summary，下次页面加载时直接读取，不重复跑
    if (comparisonReportId) {
      ReportModel.update(comparisonReportId, { humanSummary: failureAnalysis });
    }
    res.json({ success: true, data: { failureAnalysis } });
  } catch (err) { next(err); }
});

// POST /api/reports/:id/reoptimize — 基于差异分析+用户反馈重新生成豆包提示词
router.post("/:id/reoptimize", async (req, res, next) => {
  try {
    const { failureAnalysis, userFeedback } = req.body;
    const { reoptimize } = require("../services/analysis.service");
    const updated = await reoptimize(req.params.id, { failureAnalysis, userFeedback });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// POST /api/reports/:id/adopt-prompt — 采用某版提示词，写入 doubao_prompt + prompt-experiments.md
router.post("/:id/adopt-prompt", async (req, res, next) => {
  try {
    const { strategy, text, index } = req.body;
    if (!text) throw Object.assign(new Error("缺少提示词文本"), { status: 400 });

    const report = ReportModel.findById(req.params.id);
    if (!report) throw Object.assign(new Error("报告不存在"), { status: 404 });

    const systemDefault = report.doubao_prompt || "";  // 采用前系统默认版（diffA 的系统侧）
    const updated = ReportModel.update(req.params.id, { doubaoPrompt: text });

    // 经验积累：追加写入 prompt-experiments.md + 写入案例库 + 实验档案
    try {
      const db   = require("../models/db");
      const task = db.prepare("SELECT video_name, scene_type, platform, topic_fingerprint FROM tasks WHERE id = ?").get(report.task_id);

      // ① 写入案例库（用于未来 RAG 检索）
      CaseModel.create({
        reportId:   req.params.id,
        videoName:  task?.video_name || report.task_id,
        sceneType:  task?.scene_type || "other",
        platform:   task?.platform   || "douban",
        strategy:   strategy || `版本${(index ?? 0) + 1}`,
        promptText: text,
      });

      // ①.5 实验档案：append 一条 adopt 行（不改旧行，保 append-only）；
      // 记系统默认版 + 实际采用版 + strategy + satisfied，作为该题材的满意样本。
      ExperimentModel.create({
        reportId: req.params.id, taskId: report.task_id,
        videoName: task?.video_name, topicFingerprint: task?.topic_fingerprint,
        platform: task?.platform || "douban", kind: "adopt",
        systemPrompt: systemDefault, userRewrite: text,
        strategy: strategy || `版本${(index ?? 0) + 1}`, status: "satisfied",
      });

      // ② 经验日志
      const dateStr = new Date().toISOString().slice(0, 10);
      const entry   = `\n---\n**日期：** ${dateStr}  **策略：** ${strategy || `版本${(index ?? 0) + 1}`}  **视频：** ${task?.video_name || report.task_id}\n\n${text}\n`;
      fs.appendFileSync(EXP_FILE, entry, "utf8");
    } catch {}

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// POST /api/reports/:id/feedback — 提交反馈
router.post("/:id/feedback", (req, res, next) => {
  try {
    const { rating, comment, strategy } = req.body;
    if (!["adopted", "neutral", "bad"].includes(rating)) {
      throw Object.assign(new Error("rating 只能是 adopted / neutral / bad"), { status: 400 });
    }
    const report = ReportModel.findById(req.params.id);
    if (!report) throw Object.assign(new Error("报告不存在"), { status: 404 });

    const feedback = ReportModel.createFeedback({
      id: nanoid(),
      reportId: req.params.id,
      rating,
      comment: comment || "",
    });

    // 标记对应案例为 bad，避免被未来 RAG 检索引用
    if (rating === "bad" && strategy) {
      try { CaseModel.markBad(req.params.id, strategy); } catch {}
    }

    res.status(201).json({ success: true, data: feedback });
  } catch (err) {
    next(err);
  }
});

// POST /api/reports/:id/reviews — 提交提示词人工评审
router.post("/:id/reviews", (req, res, next) => {
  try {
    const { strategy, promptText, reviewText } = req.body;
    if (!reviewText?.trim()) {
      throw Object.assign(new Error("评审意见不能为空"), { status: 400 });
    }
    const report = ReportModel.findById(req.params.id);
    if (!report) throw Object.assign(new Error("报告不存在"), { status: 404 });

    const review = ReviewModel.create({
      reportId:   req.params.id,
      strategy:   strategy   || null,
      promptText: promptText || null,
      reviewText: reviewText.trim(),
    });

    // 同步追加到 prompt-experiments.md（人看日志）
    let task;
    try {
      const db      = require("../models/db");
      task    = db.prepare("SELECT video_name, topic_fingerprint, platform FROM tasks WHERE id = ?").get(report.task_id);
      const dateStr = new Date().toISOString().slice(0, 10);
      const entry   = `\n---\n**日期：** ${dateStr}  **类型：人工评审**  **视频：** ${task?.video_name || report.task_id}  **策略：** ${strategy || "未知"}\n\n**提示词：**\n${promptText || "（未记录）"}\n\n**评审意见：**\n${reviewText.trim()}\n`;
      fs.appendFileSync(EXP_FILE, entry, "utf8");
    } catch {}

    // 实验档案：写一条 user_review 行（结构化检索用，append-only）
    try {
      ExperimentModel.create({
        reportId: req.params.id, taskId: report.task_id,
        videoName: task?.video_name, topicFingerprint: task?.topic_fingerprint,
        platform: task?.platform || "douban", kind: "user_review",
        systemPrompt: promptText || null, reason: reviewText.trim(),
      });
    } catch { /* 不影响评审主流程 */ }

    res.status(201).json({ success: true, data: review });
  } catch (err) { next(err); }
});

// GET /api/reports/:id/reviews — 获取某报告的所有评审
router.get("/:id/reviews", (req, res, next) => {
  try {
    const reviews = ReviewModel.listByReport(req.params.id);
    res.json({ success: true, data: reviews });
  } catch (err) { next(err); }
});

// GET /api/reviews/recent — 最近N条评审（规则提炼用）
router.get("/reviews/recent", (req, res, next) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit || "30", 10));
    const reviews = ReviewModel.listRecent(limit);
    res.json({ success: true, data: reviews });
  } catch (err) { next(err); }
});

// GET /api/reports/export/feedback — 导出所有反馈为 JSON（供汇总用）
router.get("/export/feedback", (req, res, next) => {
  try {
    const db = require("../models/db");
    const rows = db.prepare(`
      SELECT
        f.id, f.rating, f.comment, f.created_at AS feedback_at,
        r.id AS report_id, r.doubao_prompt, r.ai_report,
        t.video_name, t.created_at AS task_at
      FROM feedback f
      JOIN reports r ON f.report_id = r.id
      JOIN tasks   t ON r.task_id   = t.id
      ORDER BY f.created_at DESC
    `).all();

    res.setHeader("Content-Disposition", `attachment; filename="feedback_${Date.now()}.json"`);
    res.json({ exported_at: new Date().toISOString(), total: rows.length, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
