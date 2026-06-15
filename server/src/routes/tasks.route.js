"use strict";

const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const { nanoid } = require("nanoid");
const config = require("../config");
const TaskModel = require("../models/task.model");
const ReportModel = require("../models/report.model");
const queueService = require("../services/queue.service");

const storage = multer.diskStorage({
  destination: config.upload.dir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^\w一-龥]/g, "_");
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "video") {
      const allowed = [".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowed.includes(ext)) return cb(null, true);
      return cb(new Error(`不支持的视频格式: ${ext}`));
    }
    if (file.fieldname === "refImages") {
      const allowed = [".jpg", ".jpeg", ".png", ".webp"];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowed.includes(ext)) return cb(null, true);
      return cb(new Error(`参考图只支持 JPG / PNG / WebP`));
    }
    cb(null, false);
  },
});

// POST /api/tasks — 上传视频（+可选参考图和台词），创建分析任务
router.post(
  "/",
  upload.fields([
    { name: "video",     maxCount: 1 },
    { name: "refImages", maxCount: 5 },
  ]),
  async (req, res, next) => {
    try {
      const videoFile = req.files?.video?.[0];
      if (!videoFile) throw Object.assign(new Error("未接收到视频文件"), { status: 400 });

      // 参考图
      const refImageFiles = req.files?.refImages || [];
      let refImagesJson = null;
      if (refImageFiles.length) {
        const labels = req.body.refLabels ? JSON.parse(req.body.refLabels) : [];
        const refData = refImageFiles.map((f, i) => ({
          path: f.path,
          filename: f.filename,
          label: labels[i] || "",
        }));
        refImagesJson = JSON.stringify(refData);
      }

      // 台词
      const scriptMode = req.body.scriptMode || null;
      const scriptJson = req.body.scriptJson || null;

      // 平台
      const platform = ["douban", "kling"].includes(req.body.platform) ? req.body.platform : "douban";

      const videoName = Buffer.from(videoFile.originalname, "latin1").toString("utf8");

      const task = TaskModel.create({
        id: nanoid(),
        videoName,
        videoPath: videoFile.path,
        refImagesJson,
        scriptMode,
        scriptJson,
        platform,
      });

      queueService.enqueue(task.id);
      res.status(201).json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/tasks — 任务列表（分页）
router.get("/", (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || "1",  10));
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
    const result = TaskModel.list({ page, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks/:id — 单个任务详情
router.get("/:id", (req, res, next) => {
  try {
    const task = TaskModel.findById(req.params.id);
    if (!task) throw Object.assign(new Error("任务不存在"), { status: 404 });
    res.json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks/:id/comparison — 获取该任务最新的对比分析任务
router.get("/:id/comparison", (req, res, next) => {
  try {
    const comparison = TaskModel.findComparisonByParentId(req.params.id);
    if (!comparison) throw Object.assign(new Error("暂无对比任务"), { status: 404 });
    res.json({ success: true, data: comparison });
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks/:id/compare — 上传生成视频，创建对比分析任务
router.post(
  "/:id/compare",
  upload.fields([{ name: "video", maxCount: 1 }]),
  async (req, res, next) => {
    try {
      const parentTask = TaskModel.findById(req.params.id);
      if (!parentTask) throw Object.assign(new Error("原任务不存在"), { status: 404 });

      const videoFile = req.files?.video?.[0];
      if (!videoFile) throw Object.assign(new Error("未接收到视频文件"), { status: 400 });

      const videoName = Buffer.from(videoFile.originalname, "latin1").toString("utf8");

      const task = TaskModel.create({
        id: nanoid(),
        videoName,
        videoPath: videoFile.path,
        platform: parentTask.platform || "douban",
        taskType: "comparison",
        parentTaskId: parentTask.id,
      });

      queueService.enqueue(task.id);
      res.status(201).json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/tasks/:id/regenerate-prompts — 只重跑豆包提示词，不重新分析视频
router.post("/:id/regenerate-prompts", async (req, res, next) => {
  try {
    const task = TaskModel.findById(req.params.id);
    if (!task) throw Object.assign(new Error("任务不存在"), { status: 404 });

    const report = ReportModel.findByTaskId(req.params.id);
    if (!report) throw Object.assign(new Error("报告不存在，请先完成视频分析"), { status: 404 });
    if (!report.ai_report) throw Object.assign(new Error("AI 报告为空，无法生成提示词"), { status: 400 });

    const { generateDoubaoPrompts } = require("../services/analysis.service");
    const refImages  = task.ref_images_json ? JSON.parse(task.ref_images_json) : [];
    const scriptMode = task.script_mode || null;
    const scriptData = task.script_json  ? JSON.parse(task.script_json)  : null;

    const newVersions = await generateDoubaoPrompts(report.ai_report, {
      refImages,
      scriptMode,
      scriptData,
      sceneType: task.scene_type || null,
      platform:  task.platform  || "douban",
    });

    const updated = ReportModel.update(report.id, {
      doubaoPromptsJson: newVersions,
      doubaoPrompt: newVersions[0]?.text || "",
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
