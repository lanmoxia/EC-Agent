# 会话记录 2026-06-16

## 环境搭建（已完成）
- 新机器（用户 999888）从零搭起：nvm-windows + Node 切到 22.22.3（机器上另有 24，**勿用 24**，better-sqlite3 ABI 绑死 22）
- server/client 依赖已装，better-sqlite3 预编译加载 OK，server/.env 的 DASHSCOPE_API_KEY 已配
- setup.ps1 修了 UTF-8 BOM（PS5.1 GBK 误读崩溃）
- 前后端已在会话内后台运行：后端 :3000、前端 :5173，均验活
- 运行态 DB：`E:\EC-Agent\claude-vision.db`（全新空库）

## 模型选型讨论（已结论，无改动）
- 维持 `qwen3.5-omni-plus`。qwen3.7-plus 虽更新更强但**仅视觉、听不到音频**，做不了台词/声部/语气；省钱选 `qwen3.5-omni-flash`（同样能听）。

---

## 进行中任务：视频分析报告「准确性校验」全面落地（4 层）

### 背景与诊断
现状只有「结构校验」（validate.js/validator.js 查时间轴倒序/重叠/超时长），**零内容校验**。用户实测见过一个重要的内容错（方向/声部/人数/色/道具朝向之一）漏过去了。目标：补齐内容准确性。

### 方案（4 层，按可靠性×成本）
- **L1 确定性地面真值**：ffprobe（时长/分辨率/画幅/帧率）+ ffmpeg 场景检测（镜头数/一镜到底）→ 对比§1，模型猜错就纠正。零模型成本。
- **L2 定向复核**：主分析后再独立喂一次视频，只问最致命的是非/选择题（走向/人数/画内外/主色/书朝向/镜头数），与报告 diff，分歧标红。+1 次模型调用。
- **L3 首帧图像接地**：抽第0帧当静态图，vision 单图分析构图，与§2 diff。+1 次 vision 调用。
- **L4 标红+台账**：前端「准确性校验」面板高亮可疑字段；追加写 `accuracy-issues.md` 台账（解决「看到错但忘了」）。

### 架构
- 新建 `server/src/lib/accuracy.js` 封装全部层，产出结构化 `accuracy` 对象
- DB reports 表加 `accuracy_json` 列（db.js 幂等迁移）
- 接进 `analysis.service.run()`（在时间轴校验后、落盘前）
- 前端 `ReportViewer.vue` 加展示
- 各层用 `config.accuracy.*` 开关可单独关

### 关键复用件（已确认存在）
- video-analyzer.js: `probeDuration` / `extractFrames` / `toImageDataUrl` / `toVideoDataUrl`（未导出，需在 accuracy.js 自带或导出）
- dashscope.js: `callDashScope(contentItems, {maxTokens})`（单图传 image_url 即可做 vision）
- §1/§2 解析正则参考 validator.js 的 `##\s*N[\.．]` 段抓取

### 分块进度（每块完成即更新）
- [x] Block A — L1 确定性地面真值（config.accuracy 开关 + accuracy.js: probeMeta/aspectLabel/detectScenes/extractSection/layerGroundTruth）。ffprobe 缺失时优雅 skip。
- [x] Block B — L2 定向复核（layerRecheck：同时喂视频+报告，核对6维 direction/char_count/voice/main_color/book_face/shots，输出 JSON match）。**真实视频实测跑通**，6维全核对。
- [x] Block C — L3 首帧图像接地（layerFirstFrame：抽首帧单图核对§2构图5项）。依赖 ffmpeg，缺失时优雅 skip 已验证。
- [x] Block D — L4a 聚合+持久化（runAccuracyChecks 聚合三层+verdict pass/review/fail；appendLedger 写 accuracy-issues.md；DB 加 accuracy_json 列已迁移；report.model create/_parse 支持；analysis.service.run 在时间轴校验后插入②.5，落盘带 accuracyJson）。**完整聚合链实测跑通**。
- [x] Block E — L4b 前端展示（ReportViewer 加「准确性校验」Tab：verdict Badge + 矛盾/存疑标红黄 + 手动修正入口 + 已一致项折叠 + 各层状态含skip原因 + meta实测时长/分辨率/fps）。Vite HMR 无编译错误。
- [x] Block F — 端到端联调+lint（node --check 全过；项目无 eslint 配置=既有问题；**完整 run() 实测跑通**：分析→时间轴→准确性②.5→提示词→落盘→DB accuracyJson 读回完整；测试任务已清理）

## ✅ 全部完成（4层准确性校验已上线）
新增/改动文件：
- server/src/lib/accuracy.js（新，全部4层逻辑）
- server/src/config.js（+accuracy 开关段）
- server/src/models/db.js（+accuracy_json 迁移）
- server/src/models/report.model.js（create/_parse 支持 accuracyJson）
- server/src/services/analysis.service.js（import + run() 插入②.5 + 落盘带 accuracyJson）
- client/src/components/business/ReportViewer.vue（+准确性校验 Tab/computed/面板）

后端已重启加载新代码（:3000），前端 HMR 已更新（:5173）。

## ✅ ffmpeg 已装（L1+L3 全部生效）
机器无 winget/choco，改为直接下载 gyan.dev 静态构建 ffmpeg 8.1.1 → 解压到 `C:\ffmpeg` → 加用户 PATH。
**重要**：会话内后端进程需用 `export PATH="/c/nvm4w/nodejs:/c/ffmpeg/bin:$PATH"` 启动才能用 ffmpeg（PATH 过期）；新开 PowerShell 窗口则已自动含 ffmpeg。
detectScenes 阈值从 0.4 调到 0.5（减少口播快剪误报）。
e2e 实测三层全跑：L1 检出"一镜到底 vs 4处硬切"，L2 抓出移动方向矛盾(verdict=fail)，L3 执行5项构图核对。
关开关：环境变量 ACCURACY_RECHECK=false / ACCURACY_FIRST_FRAME=false / ACCURACY_GROUND_TRUTH=false / ACCURACY_LEDGER=false

## ✅ ESLint 已修
原 lint 脚本因无 eslint.config.js 完全跑不起来（eslint 9 需 flat config）。
新增 server/eslint.config.js（CommonJS）+ client/eslint.config.js（Vue3 flat）。
两端 `npm run lint` 现在 exit 0 全绿。修掉真实问题：dashscope URL globals、video-analyzer 未用 platform 参数、Button.vue 未用 props、TaskView 未用 e。

## ✅ 已提交并推送 GitHub（第一轮）
commit a455c75（14 files, +884/-8）→ origin/main 推送成功。
git identity 配为仓库既有作者 lanmoxia <mrli2902933052@gmail.com>（仓库级，非全局）。
accuracy-issues.md 已加 .gitignore（运行时台账，不进库）。.claude/settings.local.json 故意不提交（本机权限设置）。

---

## 第二轮：采纳外部 AI 评审，L2 升级为盲审（已完成）
外部 AI 指出 L2 原实现的锚定缺陷（看着报告自审=心理安慰）。采纳3点，过度设计部分（6-Agent/多模型/抽8帧/JSON取代报告/硬停）拒绝。

### 改动（全部在 accuracy.js + analysis.service.js）
1. **L2 改盲审+字段级比对**：
   - 定义 FATAL_FIELDS（10个致命字段，带枚举值可程序比对）：char_count/is_one_take/shot_count/subject_position/entry_direction/movement_direction/voice_type/speaker_count/book_face/camera_motion
   - extractFactSheet(report)：纯文本调用，从报告抽10字段（只读报告不动）
   - blindVerify(video)：只看视频答封闭题，**不给报告**（破锚定）
   - 两路 Promise.all 并行 → normVal 归一化 → 逐字段 diff：两边都确定且不等=error；一边不确定=warn；都不确定=info；相等=ok
2. **致命字段事实表**：散文报告保持主产物不变，额外抽事实表专供校验（拒绝"JSON取代报告"）
3. **堵下游泄漏**：buildConflictNote(accuracy) 把 error 级冲突字段渲染成警示段，注入 generateDoubaoPrompts 的 commonContext。按 CLAUDE.md 批处理原则**不硬停、强标注**（拒绝外部AI的"禁止生成"）。run() 传 conflictNote；regenerate 路径默认""不受影响。
   - accuracy 顶层新增 conflictFields（error级字段+两边取值）
4. 前端：准确性面板加"🛡已自动规避"提示，显示提示词跳过了哪些冲突字段。

### 实测对比（同一视频 2段）
- 旧版(看报告自审)：6维全 OK
- 新版(盲审)：抓出**镜头数 2vs3、人物入画方向 already_present vs from_right** 两处真矛盾
- e2e：verdict=fail，conflictNote 注入，生成的提示词确实没写入画方向（规避生效，未硬停照常出词）
- 证明外部AI的核心批评正确：盲审显著强于自审。

### detectScenes 阈值 0.4→0.5（减口播快剪误报）

待提交：第二轮全部改动。

### accuracy 数据结构（前端用）
report.accuracyJson = {
  findings: [{layer:'L1|L2|L3', level:'error|warn|info|ok', field, claim, truth, msg}],  // 已按 error→ok 排序
  errors:[], warnings:[],
  summary:{errors,warnings,infos,oks,verdict:'pass|review|fail'},
  layers:{groundTruth,recheck,firstFrame},  // 各层 skipped/reason 或 findings
  meta:{duration,width,height,fps,...}|null
}

### ⚠ 环境缺口（需用户处理）
**这台机器没装 ffmpeg/ffprobe**（where 查无）。影响：L1 地面真值、L3 抽帧、现有 >14MB 压缩降级、validate 时长校验全部降级跳过。
建议装：`winget install Gyan.FFmpeg`（或 BtbN 版），装完重开窗口。视频直传分析本身不需要它（用户那条 `2段` 已分析成功落盘）。

### 接力提示
- 重启服务记得 `export PATH="/c/nvm4w/nodejs:$PATH"`（会话内 PATH 过期），或开新 PowerShell 窗口
- 改完 server 代码后端有 nodemon 吗？当前是 `node app.js`（非 dev），需手动重启后端进程
