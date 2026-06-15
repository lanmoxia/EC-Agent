"use strict";

const db = require("./db");
const { nanoid } = require("nanoid");

const ReviewModel = {
  create({ reportId, strategy, promptText, reviewText }) {
    const id  = nanoid();
    const now = Date.now();
    db.prepare(`
      INSERT INTO reviews (id, report_id, strategy, prompt_text, review_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, reportId, strategy || null, promptText || null, reviewText, now);
    return db.prepare("SELECT * FROM reviews WHERE id = ?").get(id);
  },

  listByReport(reportId) {
    return db.prepare(
      "SELECT * FROM reviews WHERE report_id = ? ORDER BY created_at ASC"
    ).all(reportId);
  },

  listRecent(limit = 30) {
    return db.prepare(`
      SELECT r.*, rp.task_id,
             (SELECT video_name FROM tasks WHERE id = rp.task_id) AS video_name
      FROM reviews r
      JOIN reports rp ON r.report_id = rp.id
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(limit);
  },
};

module.exports = ReviewModel;
