"use strict";

const db = require("./db");
const { nanoid } = require("nanoid");

const ReportModel = {
  create({ taskId, aiReport, humanSummary, doubaoPrompt, doubaoPromptsJson, validationJson }) {
    const id = nanoid();
    const now = Date.now();
    db.prepare(`
      INSERT INTO reports (id, task_id, ai_report, human_summary, doubao_prompt, doubao_prompts_json, validation_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, taskId, aiReport, humanSummary, doubaoPrompt,
      doubaoPromptsJson ? JSON.stringify(doubaoPromptsJson) : null,
      validationJson, now);
    return this.findById(id);
  },

  findById(id) {
    const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
    return row ? this._parse(row) : null;
  },

  findByTaskId(taskId) {
    const row = db.prepare("SELECT * FROM reports WHERE task_id = ?").get(taskId);
    return row ? this._parse(row) : null;
  },

  list({ page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const total = db.prepare("SELECT COUNT(*) AS cnt FROM reports").get().cnt;
    const data = db.prepare(`
      SELECT r.*, t.video_name, t.status AS task_status
      FROM reports r
      JOIN tasks t ON r.task_id = t.id
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset).map(this._parse);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  update(id, { aiReport, humanSummary, doubaoPrompt, doubaoPromptsJson }) {
    const sets = [];
    const vals = [];
    if (aiReport           !== undefined) { sets.push("ai_report = ?");           vals.push(aiReport); }
    if (humanSummary       !== undefined) { sets.push("human_summary = ?");       vals.push(humanSummary); }
    if (doubaoPrompt       !== undefined) { sets.push("doubao_prompt = ?");       vals.push(doubaoPrompt); }
    if (doubaoPromptsJson  !== undefined) {
      sets.push("doubao_prompts_json = ?");
      vals.push(doubaoPromptsJson ? JSON.stringify(doubaoPromptsJson) : null);
    }
    if (!sets.length) return this.findById(id);
    vals.push(id);
    db.prepare(`UPDATE reports SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return this.findById(id);
  },

  createFeedback({ id, reportId, rating, comment }) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO feedback (id, report_id, rating, comment, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, reportId, rating, comment, now);
    return db.prepare("SELECT * FROM feedback WHERE id = ?").get(id);
  },

  _parse(row) {
    return {
      ...row,
      validationJson:    row.validation_json     ? JSON.parse(row.validation_json)     : null,
      doubaoPromptsJson: row.doubao_prompts_json ? JSON.parse(row.doubao_prompts_json) : null,
    };
  },
};

module.exports = ReportModel;
