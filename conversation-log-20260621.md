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

## 账号队列：自动扫描确认 + 新增「重命名」功能
- 用户连续新建 2 个 Edge Profile 登豆包号 → 确认**号队列后端实时扫** `Local State`，无需手动加，刷新页面即出按钮
  · 第 6 个 Profile 5 初始为 Edge 默认占位名"用户配置 1"；用户在 Edge 里改名"梦茹号"后**后端已即时读到**（curl 验证），之前没显示只是**页面没刷新**
- 用户提需求：想在页面上直接改标签名（不想每次去 Edge 改+刷新）→ AskUserQuestion 确认存 **localStorage**（用户选）
- 实现（`client/src/components/business/EdgeDoubaoLauncher.vue` 一个文件，纯前端）：
  · 显示名改用 `nameOf(p)=labelMap[dir]||p.name`（**自定义优先，Edge 原名兜底**）
  · 悬浮菜单底部加「标签名」区：**重命名**(window.prompt) / **恢复默认**(设过自定义名才显示)
  · 标签存 localStorage `ec-doubao-acct-label`（按 Profile dir），与额度状态同套路；输入留空或填回原名=恢复默认
  · 引入 Pencil/RotateCcw 图标；Vite HMR 验证无报错
- 两条改名路并存：① Edge 改名+刷新页面(后端自动读) ② 页面「重命名」(不碰 Edge，立即生效)
- 提交：见 commit（下班前推送）

## 晚间（回家·重装机后）：环境恢复 + 3 处前端体验优化

### 重装系统导致的两处"丢失"（同一病根：本机用户数据被清空）
- **SSH 推送失败**：启动钩子 `git pull` 报 `Host key verification failed` → 根因 `~/.ssh` 被清空、无 key
  · 生成 ed25519 key（`-N ""` 无密码，自动 pull 钩子不卡密码）→ 用户把公钥加到 GitHub → `Hi lanmoxia!` 认证过
  · 顺带设 git 全局身份（原来空）：`lanmoxia` / `mrli2902933052@gmail.com`
  · 分叉(ahead1/behind5) → rebase 到 origin，`prompt-experiments.md` append-only 冲突两条记录都保留(按日期排) → push `3e077b3`
  · 远程已含别处推的工作：`8c375bd`(题材①层收尾 diff_b/compare_feedback——抓取点④原来已做完)、`d34c863`(活状态锚点系统取代每句lanmoxia)
- **豆包账户只剩 1 个且未登录**：账户列表＝Edge 本机 Profile(`system.route.js` 读 `Local State`)，**不进 db/git、不随 pull 同步**
  · curl `/api/system/edge-profiles` 证实现在只剩 `Default`；重装清空了 `AppData\...\Edge\User Data`
  · 关键澄清：**代码靠 git 跨机器，账户登录靠 Edge 同步(微软账号)跨机器，两套独立**；豆包号本身在云端没丢，重新登/开 Edge 同步即可

### 优化①：重命名改内联可编辑（修 VSCode 弹窗失效）
- 现象：`window.prompt` 在真浏览器能弹、在 **VSCode 内嵌浏览器(webview)被禁** → 像"摆设"
- 改 `EdgeDoubaoLauncher.vue`：`window.prompt` → 纯 DOM 内联输入框 + 内联保存确认气泡
  · 点重命名→标签变选中可编辑 input(v-focus 自动全选)；Enter/失焦→"保存为 xxx？[保存][取消]"；Esc/取消→恢复原名；无改动直接退
- 原则：别用宿主环境原生弹窗(prompt/alert/confirm)，自己画 UI 即跨环境一致，无需多套兼容

### 优化②：报告 Tab 刷新记忆
- `ReportViewer.vue`：`activeTab` 从 `ref("ai")` 改为按 **报告id** 读 localStorage(`ec-report-tab:{id}`)初始化 + watch 持久化
- 5 个 tab 刷新都停在原 tab，不跳回 AI 报告

### 优化③：滚动位置记忆 + 返回顶部按钮
- 滚动记忆：按 **报告id+tab** 存 `window.scrollY`(`ec-report-scroll:{id}:{tab}`)，刷新/切 tab 回到原区域；150ms 防抖 + beforeunload/onUnmounted 兜底
- 返回顶部：右下角固定圆钮(ArrowUp)，下滚 >300px 淡入，点击平滑回顶
- ⚠ 已知限制：AI报告/人看摘要正文在 `max-h-[600px]` 内层滚动框里，只记整页滚动、不记框内位置；其余 3 tab 整页流式完全 OK。用户暂保留小框现状(未采纳去掉内层框统一整页滚)
- 三处均 eslint exit0 + Vite HMR 无报错；用户实测"很流畅"

## 待办（延续）
- 提示词打磨主线：上传视频→出词→评审，攒题材样本（某题材 3-5 条启第②层 RAG）
- 五年级(1).mp4 提示词待磨
- VSR 去字幕：镜像拉取续 + 实测（暂停中，见 DECISIONS）
- (可选)报告 AI/人看摘要内层 600px 滚动框是否去掉统一整页滚——用户待定
- DECISIONS.md 题材①层"下一步"里抓取点④可标记已完成(远程 8c375bd 已做)
