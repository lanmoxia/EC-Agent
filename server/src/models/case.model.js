"use strict";

const db  = require("./db");
const { nanoid } = require("nanoid");

const CaseModel = {
  create({ reportId, videoName, sceneType, platform, strategy, promptText }) {
    const id  = nanoid();
    const now = Date.now();
    db.prepare(`
      INSERT INTO cases (id, report_id, video_name, scene_type, platform, strategy, prompt_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, reportId, videoName || "", sceneType || "other", platform || "douban", strategy || "", promptText, now);
    return db.prepare("SELECT * FROM cases WHERE id = ?").get(id);
  },

  // 按场景类型找最近成功案例（location 部分匹配，排除 bad 标记）
  findSimilar(sceneType, platform = "douban", limit = 2) {
    const loc = (sceneType || "").split("_")[0];
    return db.prepare(`
      SELECT * FROM cases
      WHERE platform = ? AND (scene_type = ? OR scene_type LIKE ?)
        AND (status IS NULL OR status = 'active')
      ORDER BY created_at DESC
      LIMIT ?
    `).all(platform, sceneType, `${loc}_%`, limit);
  },

  // 将某报告下指定策略的案例标为 bad（用户标了"太差"时调用）
  markBad(reportId, strategy) {
    db.prepare(`
      UPDATE cases SET status = 'bad'
      WHERE report_id = ? AND (strategy = ? OR strategy IS NULL)
    `).run(reportId, strategy || "");
  },

  // 各策略被采用次数（用于排序）
  strategyStats(platform = "douban") {
    const rows = db.prepare(`
      SELECT strategy, COUNT(*) AS cnt FROM cases
      WHERE platform = ? AND (status IS NULL OR status = 'active')
      GROUP BY strategy ORDER BY cnt DESC
    `).all(platform);
    return Object.fromEntries(rows.map(r => [r.strategy, r.cnt]));
  },

  list({ page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const total  = db.prepare("SELECT COUNT(*) AS cnt FROM cases").get().cnt;
    const data   = db.prepare("SELECT * FROM cases ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset);
    return { data, total, page, limit };
  },
};

module.exports = CaseModel;
