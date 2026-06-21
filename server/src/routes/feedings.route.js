"use strict";

const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const config = require("../config");
const FeedingModel = require("../models/feeding.model");

// 视频存储（复用全局 uploads 目录，与 tasks 一致）
const storage = multer.diskStorage({
  destination: config.upload.dir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^\w一-龥]/g, "_");
    cb(null, `feed_${base}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    return cb(new Error(`不支持的视频格式: ${ext}`));
  },
});

// 两个视频字段：对标视频 / 生成视频（均可选）
const videoFields = upload.fields([
  { name: "targetVideo",    maxCount: 1 },
  { name: "generatedVideo", maxCount: 1 },
]);

// 把 multer file 转成 { path, name }（中文名 latin1→utf8 修复，与 tasks 一致）
function toVideo(file) {
  if (!file) return null;
  return {
    path: file.path,
    name: Buffer.from(file.originalname, "latin1").toString("utf8"),
  };
}

// POST /api/feedings — 新建投喂（提示词必填，视频可选）
router.post("/", videoFields, (req, res, next) => {
  try {
    const promptText = (req.body.promptText || "").trim();
    if (!promptText) throw Object.assign(new Error("提示词不能为空"), { status: 400 });

    const feeding = FeedingModel.create({
      platform:       req.body.platform,
      promptText,
      promptJson:     req.body.promptJson || null,   // 可灵分镜数组 JSON 字符串
      note:           (req.body.note || "").trim() || null,
      targetVideo:    toVideo(req.files?.targetVideo?.[0]),
      generatedVideo: toVideo(req.files?.generatedVideo?.[0]),
    });
    res.status(201).json({ success: true, data: feeding });
  } catch (err) {
    next(err);
  }
});

// GET /api/feedings — 列表（分页）
router.get("/", (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || "1",  10));
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
    res.json({ success: true, ...FeedingModel.list({ page, limit }) });
  } catch (err) {
    next(err);
  }
});

// GET /api/feedings/:id — 单条详情
router.get("/:id", (req, res, next) => {
  try {
    const feeding = FeedingModel.findById(req.params.id);
    if (!feeding) throw Object.assign(new Error("投喂记录不存在"), { status: 404 });
    res.json({ success: true, data: feeding });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/feedings/:id — 补/换视频，或改提示词/备注
router.patch("/:id", videoFields, (req, res, next) => {
  try {
    const exists = FeedingModel.findById(req.params.id);
    if (!exists) throw Object.assign(new Error("投喂记录不存在"), { status: 404 });

    const patch = {};
    if (req.body.promptText !== undefined) patch.promptText = req.body.promptText;
    if (req.body.promptJson !== undefined) patch.promptJson = req.body.promptJson || null;
    if (req.body.note       !== undefined) patch.note       = (req.body.note || "").trim() || null;
    const targetVideo    = toVideo(req.files?.targetVideo?.[0]);
    const generatedVideo = toVideo(req.files?.generatedVideo?.[0]);
    if (targetVideo)    patch.targetVideo    = targetVideo;
    if (generatedVideo) patch.generatedVideo = generatedVideo;

    const updated = FeedingModel.update(req.params.id, patch);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
