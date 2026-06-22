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

// 实验档案表（题材学习系统第①层地基；append-only，每次反馈一行，永不删）
db.exec(`
  CREATE TABLE IF NOT EXISTS experiments (
    id                TEXT    PRIMARY KEY,
    report_id         TEXT,
    task_id           TEXT,
    video_name        TEXT,
    topic_fingerprint TEXT,
    platform          TEXT    DEFAULT 'douban',
    kind              TEXT,   -- system_gen / user_review / compare_feedback / adopt
    system_prompt     TEXT,   -- 系统生成的提示词
    user_rewrite      TEXT,   -- 用户重写/最终满意版
    diff_a            TEXT,   -- A层：系统 vs 用户重写
    problem_video     TEXT,   -- B层：问题生成视频
    problem_report    TEXT,   -- B层：问题视频分析报告
    diff_b            TEXT,   -- B层：原报告 vs 问题视频报告
    user_judgment     TEXT,   -- 用户主观判断
    reason            TEXT,   -- 用户评审理由
    strategy          TEXT,   -- 采用的是哪版策略（动作骨架/场景增强/完整复刻…）
    status            TEXT    DEFAULT 'open',  -- open / satisfied
    created_at        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_experiments_fp ON experiments(topic_fingerprint);
  CREATE INDEX IF NOT EXISTS idx_experiments_report ON experiments(report_id);
  CREATE INDEX IF NOT EXISTS idx_experiments_created ON experiments(created_at DESC);
`);

// 投喂成功提示词表（用户主动反馈入口；独立可变表，不碰 experiments 账本）
// 先干净收集，后期第②层动工时再经桥接列(topic_fingerprint/linked_experiment_id)整合
db.exec(`
  CREATE TABLE IF NOT EXISTS prompt_feedings (
    id                   TEXT    PRIMARY KEY,
    platform             TEXT    NOT NULL DEFAULT 'douban',      -- douban / kling
    prompt_text          TEXT    NOT NULL,                       -- 拍平文本(豆包整段/可灵分镜拼接)，供 Claude 读+展示
    prompt_json          TEXT,                                   -- 可灵分镜数组 JSON：[{index,text,targetSegment?:{path,name},generated?:{path,name}}]（豆包为 null）
    target_video_path    TEXT,                                   -- 豆包对标 / 可灵整段对标（later 补）
    target_video_name    TEXT,
    generated_video_path TEXT,                                   -- 豆包生成视频（可灵生成在每镜 prompt_json 内，顶层留空）
    generated_video_name TEXT,
    note                 TEXT,                                   -- 用户备注（可选）
    status               TEXT    NOT NULL DEFAULT 'prompt_only', -- prompt_only / complete
    topic_fingerprint    TEXT,                                   -- 桥接钩子（先留空，第②层整合用）
    linked_experiment_id TEXT,                                   -- 桥接钩子（先留空，第②层整合用）
    created_at           INTEGER NOT NULL,
    updated_at           INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_feedings_created ON prompt_feedings(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feedings_platform ON prompt_feedings(platform);
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
  "ALTER TABLE tasks ADD COLUMN topic_fingerprint TEXT",
  "ALTER TABLE experiments ADD COLUMN strategy TEXT",
]) {
  try { db.exec(col); } catch {}
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_reports_task ON reports(task_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_report ON feedback(report_id);
`);

module.exports = db;
