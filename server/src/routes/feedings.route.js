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

// 合法字段名：豆包对标/生成 + 可灵整段对标(targetVideo) + 可灵每镜 klingTarget_i / klingGen_i
const FIELD_RE = /^(targetVideo|generatedVideo|klingTarget_\d+|klingGen_\d+)$/;

const upload = multer({
  storage,
  // files 上限 = 整段对标 + 生成 + 可灵每镜两视频（约 20 镜）；防 upload.any() 滥用
  limits: { fileSize: config.upload.maxMb * 1024 * 1024, files: 42 },
  fileFilter: (req, file, cb) => {
    if (!FIELD_RE.test(file.fieldname)) return cb(new Error(`非法上传字段: ${file.fieldname}`));
    const allowed = [".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    return cb(new Error(`不支持的视频格式: ${ext}`));
  },
});

// 动态字段：豆包 targetVideo/generatedVideo + 可灵 klingTarget_i/klingGen_i（数量随分镜变）
const videoFields = upload.any();

// 把 multer file 转成 { path, name }（中文名 latin1→utf8 修复，与 tasks 一致）
function toVideo(file) {
  if (!file) return null;
  return {
    path: file.path,
    name: Buffer.from(file.originalname, "latin1").toString("utf8"),
  };
}

// upload.any() 的 req.files 是数组 → 按 fieldname 索引成 map（每字段只取一个）
function indexFiles(files) {
  const map = {};
  for (const f of files || []) if (!map[f.fieldname]) map[f.fieldname] = f;
  return map;
}

/**
 * 合并可灵分镜：以 baseJson(前端新提交) 或 existingShots(PATCH 保留) 为底，
 * 把上传的 klingTarget_i / klingGen_i 文件挂到对应 shot 的 targetSegment / generated。
 * 返回分镜数组（含每镜内嵌视频）。
 */
function mergeKlingShots(baseJson, fileMap, existingShots) {
  let shots = [];
  if (baseJson) {
    try { const p = JSON.parse(baseJson); if (Array.isArray(p)) shots = p.map(s => ({ ...s })); }
    catch { shots = []; }
  } else if (Array.isArray(existingShots)) {
    shots = existingShots.map(s => ({ ...s }));
  }
  for (const [field, file] of Object.entries(fileMap)) {
    let m = /^klingTarget_(\d+)$/.exec(field);
    if (m && shots[+m[1]]) { shots[+m[1]].targetSegment = toVideo(file); continue; }
    m = /^klingGen_(\d+)$/.exec(field);
    if (m && shots[+m[1]]) { shots[+m[1]].generated = toVideo(file); }
  }
  return shots;
}

// POST /api/feedings — 新建投喂（提示词必填，视频可选）
router.post("/", videoFields, (req, res, next) => {
  try {
    const promptText = (req.body.promptText || "").trim();
    if (!promptText) throw Object.assign(new Error("提示词不能为空"), { status: 400 });

    const platform = req.body.platform === "kling" ? "kling" : "douban";
    const fileMap  = indexFiles(req.files);

    const feeding = FeedingModel.create({
      platform,
      promptText,
      // 可灵：分镜数组合并每镜内嵌视频；豆包：null
      promptJson:     platform === "kling" ? mergeKlingShots(req.body.promptJson, fileMap) : null,
      note:           (req.body.note || "").trim() || null,
      // targetVideo = 豆包对标 或 可灵整段对标
      targetVideo:    toVideo(fileMap.targetVideo),
      // 顶层 generated 只属于豆包；可灵生成视频在每镜里
      generatedVideo: platform === "kling" ? null : toVideo(fileMap.generatedVideo),
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

    const fileMap = indexFiles(req.files);
    const patch = {};
    if (req.body.promptText !== undefined) patch.promptText = req.body.promptText;
    if (req.body.note       !== undefined) patch.note       = (req.body.note || "").trim() || null;

    if (exists.platform === "kling") {
      // 可灵：把新上传的每镜视频合并进现有分镜（未重传的镜保留原引用）
      const hasShotFiles = Object.keys(fileMap).some(f => /^kling(Target|Gen)_\d+$/.test(f));
      if (req.body.promptJson !== undefined || hasShotFiles) {
        const base = req.body.promptJson !== undefined ? req.body.promptJson : null;
        patch.promptJson = mergeKlingShots(base, fileMap, exists.promptJson);
      }
      // 整段对标 → 顶层 target（可灵不碰顶层 generated）
      const wholeTarget = toVideo(fileMap.targetVideo);
      if (wholeTarget) patch.targetVideo = wholeTarget;
    } else {
      // 豆包：单对标 + 单生成
      if (req.body.promptJson !== undefined) patch.promptJson = req.body.promptJson || null;
      const targetVideo    = toVideo(fileMap.targetVideo);
      const generatedVideo = toVideo(fileMap.generatedVideo);
      if (targetVideo)    patch.targetVideo    = targetVideo;
      if (generatedVideo) patch.generatedVideo = generatedVideo;
    }

    const updated = FeedingModel.update(req.params.id, patch);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
