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
    const plat = ["douban", "kling"].includes(platform) ? platform : "douban";
    const shots = parseShots(promptJson);   // 可灵分镜数组（含每镜内嵌视频）；豆包为 null
    const row = {
      id,
      platform: plat,
      prompt_text: promptText || "",
      prompt_json: shots ? JSON.stringify(shots) : null,
      target_video_path:    targetVideo?.path    ?? null,
      target_video_name:    targetVideo?.name    ?? null,
      generated_video_path: generatedVideo?.path ?? null,
      generated_video_name: generatedVideo?.name ?? null,
      note: note || null,
      status: computeStatus(plat, {
        targetPath:    targetVideo?.path,
        generatedPath: generatedVideo?.path,
        shots,
      }),
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
    let nextShots;   // undefined=未改用旧值，null/array=本次新值
    if (promptJson !== undefined) {
      nextShots = parseShots(promptJson);
      sets.push("prompt_json = @prompt_json");
      vals.prompt_json = nextShots ? JSON.stringify(nextShots) : null;
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

    // 用更新后的视频路径 + 分镜重算 status
    const nextTarget    = targetVideo    ? targetVideo.path    : cur.target_video_path;
    const nextGenerated = generatedVideo ? generatedVideo.path : cur.generated_video_path;
    const effShots      = nextShots !== undefined ? nextShots : parseShots(cur.prompt_json);
    sets.push("status = @status");
    vals.status = computeStatus(cur.platform, {
      targetPath: nextTarget,
      generatedPath: nextGenerated,
      shots: effShots,
    });

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

/** 把 promptJson（字符串/数组/null）归一成分镜数组或 null */
function parseShots(promptJson) {
  if (!promptJson) return null;
  if (Array.isArray(promptJson)) return promptJson;
  if (typeof promptJson === "string") {
    try { const p = JSON.parse(promptJson); return Array.isArray(p) ? p : null; }
    catch { return null; }
  }
  return null;
}

/**
 * 状态判定（按平台）：
 * - 豆包：对标 + 生成两视频齐 = complete
 * - 可灵：(整段对标 或 每镜都有对标分段) 且 每镜都有生成视频 = complete
 * 其余（含空分镜）= prompt_only。
 */
function computeStatus(platform, { targetPath, generatedPath, shots } = {}) {
  if (platform === "kling") {
    if (!Array.isArray(shots) || !shots.length) return "prompt_only";
    const everyGen = shots.every(s => s?.generated?.path);
    const everySeg = shots.every(s => s?.targetSegment?.path);
    const hasTarget = !!targetPath || everySeg;
    return hasTarget && everyGen ? "complete" : "prompt_only";
  }
  return targetPath && generatedPath ? "complete" : "prompt_only";
}

module.exports = FeedingModel;
