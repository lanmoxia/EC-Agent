"use strict";

const db = require("./db");

const TaskModel = {
  create({ id, videoName, videoPath, refImagesJson = null, scriptMode = null, scriptJson = null, platform = "douban", taskType = "original", parentTaskId = null, userFeedback = null }) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO tasks (id, status, video_name, video_path, ref_images_json, script_mode, script_json, platform, task_type, parent_task_id, user_feedback, created_at, updated_at)
      VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, videoName, videoPath, refImagesJson, scriptMode, scriptJson, platform, taskType, parentTaskId, userFeedback, now, now);
    return this.findById(id);
  },

  findById(id) {
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) || null;
  },

  findComparisonByParentId(parentId) {
    return db.prepare(
      "SELECT * FROM tasks WHERE parent_task_id = ? AND task_type = 'comparison' ORDER BY created_at DESC LIMIT 1"
    ).get(parentId) || null;
  },

  list({ page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const total = db.prepare("SELECT COUNT(*) AS cnt FROM tasks WHERE task_type = 'original'").get().cnt;
    const data = db.prepare(
      "SELECT * FROM tasks WHERE task_type = 'original' ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).all(limit, offset);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  updateStatus(id, status, errorMsg = null) {
    db.prepare(`
      UPDATE tasks SET status = ?, error_msg = ?, updated_at = ? WHERE id = ?
    `).run(status, errorMsg, Date.now(), id);
    return this.findById(id);
  },

  updateSceneType(id, sceneType) {
    db.prepare("UPDATE tasks SET scene_type = ?, updated_at = ? WHERE id = ?")
      .run(sceneType, Date.now(), id);
  },
};

module.exports = TaskModel;
