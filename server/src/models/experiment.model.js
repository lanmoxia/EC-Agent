"use strict";

const db = require("./db");
const { nanoid } = require("nanoid");

/**
 * 实验档案（题材学习系统第①层地基）。
 * append-only：每次反馈写一行，永不删除。kind 区分事件类型。
 * 后续第②层(提炼活规则)、第③层(毕业固化)都从这张表取数据。
 */
const ExperimentModel = {
  /** 追加一条实验记录 */
  create(fields = {}) {
    const id = nanoid();
    const now = Date.now();
    const cols = [
      "id", "report_id", "task_id", "video_name", "topic_fingerprint", "platform",
      "kind", "system_prompt", "user_rewrite", "diff_a", "problem_video",
      "problem_report", "diff_b", "user_judgment", "reason", "status", "created_at",
    ];
    const vals = {
      id,
      report_id:         fields.reportId         ?? null,
      task_id:           fields.taskId           ?? null,
      video_name:        fields.videoName        ?? null,
      topic_fingerprint: fields.topicFingerprint ?? null,
      platform:          fields.platform         ?? "douban",
      kind:              fields.kind             ?? null,
      system_prompt:     fields.systemPrompt     ?? null,
      user_rewrite:      fields.userRewrite      ?? null,
      diff_a:            fields.diffA            ?? null,
      problem_video:     fields.problemVideo     ?? null,
      problem_report:    fields.problemReport    ?? null,
      diff_b:            fields.diffB            ?? null,
      user_judgment:     fields.userJudgment     ?? null,
      reason:            fields.reason           ?? null,
      status:            fields.status           ?? "open",
      created_at:        now,
    };
    db.prepare(`INSERT INTO experiments (${cols.join(", ")}) VALUES (${cols.map(c => "@" + c).join(", ")})`).run(vals);
    return db.prepare("SELECT * FROM experiments WHERE id = ?").get(id);
  },

  /** 某报告的所有实验记录（时间正序，便于看迭代过程） */
  listByReport(reportId) {
    return db.prepare("SELECT * FROM experiments WHERE report_id = ? ORDER BY created_at ASC").all(reportId);
  },

  /** 同题材的实验记录（用于第②层提炼活规则） */
  listByFingerprint(topicFingerprint, limit = 50) {
    return db.prepare(
      "SELECT * FROM experiments WHERE topic_fingerprint = ? ORDER BY created_at DESC LIMIT ?"
    ).all(topicFingerprint, limit);
  },

  /** 最近 N 条（人看/调试） */
  listRecent(limit = 50) {
    return db.prepare("SELECT * FROM experiments ORDER BY created_at DESC LIMIT ?").all(limit);
  },

  /**
   * 题材"毕业"计数（借鉴调度系统经验账本 occurrences）：
   * 返回该题材的 satisfied 实验数 + 总实验数。供未来 evolution 扫描提议毕业（仍需用户确认）。
   */
  occurrences(topicFingerprint) {
    // 按「视频(report)」去重计数，不按行——否则同一视频多行会灌水毕业门槛
    const row = db.prepare(`
      SELECT
        COUNT(DISTINCT report_id) AS total,
        COUNT(DISTINCT CASE WHEN status = 'satisfied' THEN report_id END) AS satisfied
      FROM experiments WHERE topic_fingerprint = ?
    `).get(topicFingerprint);
    return { total: row.total || 0, satisfied: row.satisfied || 0 };
  },

  /** 把某报告的某次实验标记为满意（采用时调用） */
  markSatisfied(reportId) {
    db.prepare("UPDATE experiments SET status = 'satisfied' WHERE report_id = ? AND status = 'open'").run(reportId);
  },
};

module.exports = ExperimentModel;
