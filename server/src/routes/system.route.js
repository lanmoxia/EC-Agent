"use strict";

const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const router = express.Router();

// Edge 可执行文件常见路径（Windows）
const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function findEdge() {
  return EDGE_PATHS.find(p => fs.existsSync(p)) || null;
}

// Edge 用户数据目录（Profile 在此）
function edgeUserDataDir() {
  return path.join(os.homedir(), "AppData", "Local", "Microsoft", "Edge", "User Data");
}

/**
 * 读取 Edge 多账户配置（Profile）列表。
 * 名字来自 Local State 的 profile.info_cache（权威），目录名用于 --profile-directory 启动。
 * @returns {Array<{dir:string, name:string}>}
 */
function listEdgeProfiles() {
  try {
    const ls = path.join(edgeUserDataDir(), "Local State");
    const j = JSON.parse(fs.readFileSync(ls, "utf8"));
    const cache = (j.profile && j.profile.info_cache) || {};
    return Object.entries(cache)
      .map(([dir, info]) => ({
        dir,
        name: info.name || info.shortcut_name || info.gaia_name || dir,
      }))
      // 只保留目录真实存在的
      .filter(p => fs.existsSync(path.join(edgeUserDataDir(), p.dir)))
      // Default 排前，其余按目录名
      .sort((a, b) => (a.dir === "Default" ? -1 : b.dir === "Default" ? 1 : a.dir.localeCompare(b.dir)));
  } catch {
    return [];
  }
}

/**
 * GET /api/system/edge-profiles
 * 列出 Edge 多账户配置（用于豆包多账号一键切换）。
 */
router.get("/edge-profiles", (req, res) => {
  res.json({ success: true, profiles: listEdgeProfiles(), edgeFound: !!findEdge() });
});

/**
 * POST /api/system/open-edge
 * body: { url?, profile? }
 * 用 Edge 打开指定网址（默认豆包）。可指定 profile（Edge Profile 目录名，如 "Profile 1"）
 * 以对应豆包账号的登录态打开。后端跑在本机，有权限拉起本地浏览器。
 * 目的：让用户在 Edge 里用 doubao-nomark 插件一键下无水印（Chrome 装不了该插件）+ 多账号一键切换。
 */
router.post("/open-edge", (req, res, next) => {
  try {
    const url = typeof req.body.url === "string" && /^https?:\/\//.test(req.body.url)
      ? req.body.url
      : "https://www.doubao.com/";

    // 校验 profile：必须是已存在的 Profile 目录，防止任意参数注入
    let profileArgs = [];
    if (req.body.profile) {
      const valid = listEdgeProfiles().some(p => p.dir === req.body.profile);
      if (valid) profileArgs = [`--profile-directory=${req.body.profile}`];
    }

    const edge = findEdge();
    if (edge) {
      // 直接用完整路径启动，避免 shell 转义问题；detached + unref 让它独立于后端进程
      spawn(edge, [...profileArgs, url], { detached: true, stdio: "ignore" }).unref();
      return res.json({ success: true, browser: "edge", profile: req.body.profile || null, url });
    }

    // 兜底：通过 cmd 的 start 调用已注册的 msedge App Path
    spawn("cmd", ["/c", "start", "msedge", ...profileArgs, url], { detached: true, stdio: "ignore" }).unref();
    res.json({ success: true, browser: "edge(start)", profile: req.body.profile || null, url });
  } catch (err) {
    next(Object.assign(new Error(`无法启动 Edge：${err.message}（请确认已安装 Microsoft Edge）`), { status: 500 }));
  }
});

module.exports = router;
