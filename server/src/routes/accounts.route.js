"use strict";

const router = require("express").Router();
const AccountModel = require("../models/account.model");

// GET /api/accounts
router.get("/", (req, res, next) => {
  try {
    res.json({ success: true, data: AccountModel.list() });
  } catch (err) { next(err); }
});

// POST /api/accounts — 新增账号
router.post("/", (req, res, next) => {
  try {
    const { label, douyinId, notes } = req.body;
    if (!label?.trim()) throw Object.assign(new Error("label 不能为空"), { status: 400 });
    const account = AccountModel.create({ label: label.trim(), douyinId, notes });
    res.status(201).json({ success: true, data: account });
  } catch (err) { next(err); }
});

// PATCH /api/accounts/:id — 编辑账号
router.patch("/:id", (req, res, next) => {
  try {
    const { label, douyinId, notes, status } = req.body;
    const account = AccountModel.update(req.params.id, { label, douyinId, notes, status });
    if (!account) throw Object.assign(new Error("账号不存在"), { status: 404 });
    res.json({ success: true, data: account });
  } catch (err) { next(err); }
});

// POST /api/accounts/:id/activate — 设为当前使用账号
router.post("/:id/activate", (req, res, next) => {
  try {
    const account = AccountModel.setCurrent(req.params.id);
    if (!account) throw Object.assign(new Error("账号不存在"), { status: 404 });
    res.json({ success: true, data: account });
  } catch (err) { next(err); }
});

// DELETE /api/accounts/:id
router.delete("/:id", (req, res, next) => {
  try {
    const account = AccountModel.delete(req.params.id);
    if (!account) throw Object.assign(new Error("账号不存在"), { status: 404 });
    res.json({ success: true, data: account });
  } catch (err) { next(err); }
});

module.exports = router;
