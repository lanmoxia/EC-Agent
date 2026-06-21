# 会话记录 2026-06-21

> 续 6-19。本日：日常答疑（Edge 多账号机制澄清 + Profile 无 IP 隔离）+ 小功能（豆包额度状态新增第 4 种）。

## 启动接力
- `git pull` 已最新；Node v22.22.3 / server+client 依赖就绪；后台起 server+client，curl 验活：后端 `/api/tasks` 200、前端 :5173 200（后端根路径 `/` 404 是正常的，无首页路由）
- 读 6-19 log + DECISIONS 接回：主线＝回归打磨攒题材样本；第②层 RAG 等数据；VSR 去字幕暂停
- 环境提示里的工作目录写成 `/Users/dev/...`(darwin) 是错的，实际 Windows+Git Bash，项目在 `/e/EC-Agent`

## 答疑：Edge 打开豆包 / 额度标注 / 删号重登（三套独立系统澄清）
- 用户问：额度都用完→删抖音账户重登，提示词页面再打开还能继续吗？
- 查清**三套互相独立**：
  · **Edge 打开按钮** ＝ Edge 本机 Profile（`system.route.js` 读 `Local State` 的 `profile.info_cache`），点击 `--profile-directory=X` 启动 Edge
  · **额度标注（绿黄红）** ＝ 前端 **localStorage**（key=`ec-doubao-acct-status`，按 Profile dir 记），手动标、**不自动检测**豆包真实额度
  · **抖音账户** ＝ SQLite `accounts` 表，与 Edge 打开**零代码关联**
- 用户确认场景＝**同一 Profile 内、豆包网页退出换号** → 结论：Profile 不变，按钮和打开**不受影响**；唯一要手动做＝把额度色点回绿（系统不知道你换了号）
- 建议（可选，用户暂未采纳）：每个豆包号建独立 Edge Profile → 按钮自动出、额度色不错位、切号不用退登

## 答疑：Profile 无 IP 隔离
- Edge Profile 只隔离 cookie/登录态/缓存/扩展，**不隔离出口 IP，也不隔离浏览器指纹**；多 Profile 在豆包看来是同一 IP + 高度相似设备
- 要真 IP 隔离三条路：① per-profile 代理（可给 `open-edge` 加 `--proxy-server`）② 指纹浏览器(AdsPower/比特/Multilogin，付费) ③ 物理隔离
- 用户：指纹浏览器付费，**先不考虑** → IP 隔离线暂放下

## 小功能：豆包额度状态新增第 4 种「额度已更新」(蓝)
- 改 `client/src/components/business/EdgeDoubaoLauncher.vue` 四处常量：`STATUS_ORDER` / `STATUS_LABEL` / `STATUS_STYLE` / `STATUS_DOT`
- 4 态（好→差）：正常(绿) / **额度已更新(蓝 sky，新增)** / 待更新额度(黄) / 额度用完(红)
- 验证：Vite HMR 两次更新无报错，`index.css` 跟着重生成 → 证明 sky 动态类被 Tailwind 扫到并生效；localStorage 旧标注向后兼容（纯增量）
- 用户看过确认 OK → 提交

## 待办（延续）
- 提示词打磨主线：上传视频→出词→评审，攒题材样本（某题材 3-5 条启第②层 RAG）
- 五年级(1).mp4 提示词待磨
- VSR 去字幕：镜像拉取续 + 实测（暂停中，见 DECISIONS）
