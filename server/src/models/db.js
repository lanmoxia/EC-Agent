"use strict";

const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const config = require("../config");

// 确保数据库目录存在
const dbDir = path.dirname(config.db.path);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(config.db.path);

// WAL 模式：提升并发读写性能
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── 建表迁移（幂等） ──────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT    PRIMARY KEY,
    status      TEXT    NOT NULL DEFAULT 'pending',
    video_name  TEXT    NOT NULL,
    video_path  TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    error_msg   TEXT
  );

  CREATE TABLE IF NOT EXISTS reports (
    id               TEXT    PRIMARY KEY,
    task_id          TEXT    NOT NULL REFERENCES tasks(id),
    ai_report        TEXT,
    human_summary    TEXT,
    doubao_prompt    TEXT,
    validation_json  TEXT,
    created_at       INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id          TEXT    PRIMARY KEY,
    report_id   TEXT    NOT NULL REFERENCES reports(id),
    rating      TEXT    NOT NULL,
    comment     TEXT,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id          TEXT    PRIMARY KEY,
    label       TEXT    NOT NULL,
    douyin_id   TEXT,
    status      TEXT    NOT NULL DEFAULT 'active',
    is_current  INTEGER NOT NULL DEFAULT 0,
    notes       TEXT,
    created_at  INTEGER NOT NULL,
    last_used   INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
`);

// 案例库表（RAG 检索用）
db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id          TEXT    PRIMARY KEY,
    report_id   TEXT    NOT NULL REFERENCES reports(id),
    video_name  TEXT,
    scene_type  TEXT,
    platform    TEXT    DEFAULT 'douban',
    strategy    TEXT,
    prompt_text TEXT    NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cases_scene ON cases(scene_type);
`);

// 提示词人工评审表
db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id          TEXT    PRIMARY KEY,
    report_id   TEXT    NOT NULL REFERENCES reports(id),
    strategy    TEXT,
    prompt_text TEXT,
    review_text TEXT    NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reviews_report ON reviews(report_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);
`);

// 迁移：为旧数据库补列（幂等）
for (const col of [
  "ALTER TABLE tasks ADD COLUMN ref_images_json TEXT",
  "ALTER TABLE tasks ADD COLUMN script_mode TEXT",
  "ALTER TABLE tasks ADD COLUMN script_json TEXT",
  "ALTER TABLE tasks ADD COLUMN platform TEXT DEFAULT 'douban'",
  "ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT 'original'",
  "ALTER TABLE tasks ADD COLUMN parent_task_id TEXT",
  "ALTER TABLE reports ADD COLUMN doubao_prompts_json TEXT",
  "ALTER TABLE tasks ADD COLUMN scene_type TEXT",
  "ALTER TABLE cases ADD COLUMN status TEXT DEFAULT 'active'",
  "ALTER TABLE reports ADD COLUMN accuracy_json TEXT",
  "ALTER TABLE tasks ADD COLUMN user_feedback TEXT",
]) {
  try { db.exec(col); } catch {}
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_reports_task ON reports(task_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_report ON feedback(report_id);
`);

module.exports = db;
