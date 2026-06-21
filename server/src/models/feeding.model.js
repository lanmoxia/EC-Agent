"use strict";

const db = require("./db");
const { nanoid } = require("nanoid");

/**
 * 投喂成功提示词（用户主动反馈入口）。
 * 独立可变表：先干净收集（提示词先交，对标/生成视频 later 补），不碰 experiments 账本。
 * status：prompt_only（只交了提示词） / complete（对标+生成两视频齐全）。
 * 桥接列 topic_fingerprint / linked_experiment_id 先留空，等第②层动工再整合。
 */
const FeedingModel = {
  /** 新建一条投喂（至少提示词；视频可后补） */
  create({ platform, promptText, promptJson, note, targetVideo, generatedVideo } = {}) {
    const id = nanoid();
    const now = Date.now();
    const row = {
      id,
      platform: ["douban", "kling"].includes(platform) ? platform : "douban",
      prompt_text: promptText || "",
      prompt_json: promptJson ? (typeof promptJson === "string" ? promptJson : JSON.stringify(promptJson)) : null,
      target_video_path:    targetVideo?.path    ?? null,
      target_video_name:    targetVideo?.name    ?? null,
      generated_video_path: generatedVideo?.path ?? null,
      generated_video_name: generatedVideo?.name ?? null,
      note: note || null,
      status: computeStatus(targetVideo?.path, generatedVideo?.path),
      created_at: now,
      updated_at: now,
    };
    const cols = Object.keys(row);
    db.prepare(
      `INSERT INTO prompt_feedings (${cols.join(", ")}) VALUES (${cols.map(c => "@" + c).join(", ")})`
    ).run(row);
    return this.findById(id);
  },

  findById(id) {
    const row = db.prepare("SELECT * FROM prompt_feedings WHERE id = ?").get(id);
    return row ? this._parse(row) : null;
  },

  list({ page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const total = db.prepare("SELECT COUNT(*) AS cnt FROM prompt_feedings").get().cnt;
    const data = db.prepare(
      "SELECT * FROM prompt_feedings ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).all(limit, offset).map(this._parse);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  /**
   * 部分更新（补/换视频、改提示词或备注）。
   * 视频字段更新后自动重算 status。
   */
  update(id, { promptText, promptJson, note, targetVideo, generatedVideo } = {}) {
    const cur = db.prepare("SELECT * FROM prompt_feedings WHERE id = ?").get(id);
    if (!cur) return null;

    const sets = [];
    const vals = {};
    if (promptText !== undefined) { sets.push("prompt_text = @prompt_text"); vals.prompt_text = promptText || ""; }
    if (promptJson !== undefined) {
      sets.push("prompt_json = @prompt_json");
      vals.prompt_json = promptJson ? (typeof promptJson === "string" ? promptJson : JSON.stringify(promptJson)) : null;
    }
    if (note !== undefined) { sets.push("note = @note"); vals.note = note || null; }
    if (targetVideo) {
      sets.push("target_video_path = @target_video_path", "target_video_name = @target_video_name");
      vals.target_video_path = targetVideo.path;
      vals.target_video_name = targetVideo.name;
    }
    if (generatedVideo) {
      sets.push("generated_video_path = @generated_video_path", "generated_video_name = @generated_video_name");
      vals.generated_video_path = generatedVideo.path;
      vals.generated_video_name = generatedVideo.name;
    }

    // 用更新后的视频路径重算 status
    const nextTarget    = targetVideo    ? targetVideo.path    : cur.target_video_path;
    const nextGenerated = generatedVideo ? generatedVideo.path : cur.generated_video_path;
    sets.push("status = @status");
    vals.status = computeStatus(nextTarget, nextGenerated);

    sets.push("updated_at = @updated_at");
    vals.updated_at = Date.now();
    vals.id = id;

    db.prepare(`UPDATE prompt_feedings SET ${sets.join(", ")} WHERE id = @id`).run(vals);
    return this.findById(id);
  },

  _parse(row) {
    return {
      ...row,
      promptJson: row.prompt_json ? JSON.parse(row.prompt_json) : null,
    };
  },
};

/** 对标 + 生成两视频齐全 = complete，否则 prompt_only */
function computeStatus(targetPath, generatedPath) {
  return targetPath && generatedPath ? "complete" : "prompt_only";
}

module.exports = FeedingModel;
