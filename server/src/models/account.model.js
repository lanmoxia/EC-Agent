"use strict";

const db = require("./db");
const { nanoid } = require("nanoid");

const AccountModel = {
  create({ label, douyinId = "", notes = "" }) {
    const id = nanoid();
    const now = Date.now();
    const isFirst = db.prepare("SELECT COUNT(*) AS cnt FROM accounts").get().cnt === 0;
    db.prepare(`
      INSERT INTO accounts (id, label, douyin_id, status, is_current, notes, created_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)
    `).run(id, label, douyinId, isFirst ? 1 : 0, notes, now);
    return this.findById(id);
  },

  findById(id) {
    return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) || null;
  },

  list() {
    return db.prepare("SELECT * FROM accounts ORDER BY created_at ASC").all();
  },

  setCurrent(id) {
    db.prepare("UPDATE accounts SET is_current = 0").run();
    db.prepare("UPDATE accounts SET is_current = 1, last_used = ? WHERE id = ?").run(Date.now(), id);
    return this.findById(id);
  },

  getCurrent() {
    return db.prepare("SELECT * FROM accounts WHERE is_current = 1").get() || null;
  },

  delete(id) {
    const deleted = this.findById(id);
    db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    // 如果删的是当前账号，自动激活第一个剩余账号
    if (deleted?.is_current) {
      const next = db.prepare("SELECT id FROM accounts ORDER BY created_at ASC LIMIT 1").get();
      if (next) db.prepare("UPDATE accounts SET is_current = 1 WHERE id = ?").run(next.id);
    }
    return deleted;
  },

  update(id, { label, douyinId, notes, status }) {
    const fields = [];
    const vals = [];
    if (label    !== undefined) { fields.push("label = ?");     vals.push(label); }
    if (douyinId !== undefined) { fields.push("douyin_id = ?"); vals.push(douyinId); }
    if (notes    !== undefined) { fields.push("notes = ?");     vals.push(notes); }
    if (status   !== undefined) { fields.push("status = ?");    vals.push(status); }
    if (!fields.length) return this.findById(id);
    vals.push(id);
    db.prepare(`UPDATE accounts SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    return this.findById(id);
  },
};

module.exports = AccountModel;
