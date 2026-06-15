# 会话记录 2026-06-15

## 背景

本次会话从零开始（无接力文件），先通读整个项目，然后完成 TODO 清理 + 两项功能开发。

---

## 一、项目通读结论

### 架构快照

- **CLI 工具**：`video.js`（视频直传/抽帧/URL三模式）、`vision.js`（图片）、`validate.js`（时间轴校验）
- **服务端**：Express + SQLite (better-sqlite3 WAL)，4表：tasks/reports/feedback/accounts
  - `video-analyzer.js` — 压缩降级链（crf28→32→抽帧）+ 参考图/台词注入 + ffprobe 时长写入 prompt
  - `analysis.service.js` — 主流程：Qwen感知→校验→摘要→**3版豆包提示词并行生成**→落盘
  - `queue.service.js` — 内存并发队列（默认3并发）
- **前端**：Vue 3 + Vite + Tailwind，路由：`/`首页 / `/tasks/:id`详情 / `/history`历史

### 豆包提示词生成机制（已于之前某串完成）

`analysis.service.js:160` 的 `generateDoubaoPrompts()` 并行生成3版：
- **动作骨架版** ~90字：最精简，只写复刻必须的动作链
- **场景增强版** ~120字：加开场空间布局和色调
- **完整复刻版** ~150字：覆盖全部关键画面细节 + 末尾时长预检

每版都走独立 AI 调用（`callDashScope`），输出时在 ReportViewer 里以卡片展示，带「采用 / 一般 / 太差」反馈按钮。

---

## 二、TODO 清理（本次会话完成）

### 对照代码核实结果

| 旧 TODO 项 | 实际状态 | 依据 |
|---|---|---|
| ffprobe 时长注入 | ✅ 已完成 | `video-analyzer.js:271` `probeDuration()` 结果写入 prompt |
| 豆包提示词 Tab 为空 | ✅ 已完成 | `analysis.service.js:160` 独立 AI 生成3版 |
| 豆包提示词可编辑 | ✅ 已完成 | 单版本模式铅笔图标→textarea→`PUT /api/reports/:id` |
| 反馈按钮书签样式 | ✅ 已完成（改设计） | 卡片内置采用/一般/太差 + 确认弹窗，比书签更合用 |
| 报告内容可编辑 | ⚠️ 部分完成 | doubao_prompt 已做；ai_report/human_summary 仍只读 |
| 时间轴校验操作入口 | ❌ 未做 | 展示层有，无操作按钮 |

### TODO.md 已同步更新

---

## 三、本次会话开发内容

### 改动文件：`client/src/components/business/ReportViewer.vue`

#### 1. AI 报告 Tab 可编辑

- 右上角加「编辑」按钮（Pencil 图标），点击切换为 20行 monospace textarea
- 「保存」调 `reportsApi.update(id, { ai_report })` → `PUT /api/reports/:id`
- 本地 `aiReportText` ref 即时同步，无需刷新页面
- 「取消」恢复只读视图

#### 2. 人看摘要 Tab 可编辑

- 同上模式，10行 textarea
- 「保存」字段 `human_summary`
- 加「复制」按钮

#### 3. 时间轴校验 Tab 操作入口

- 错误列表下方出现「手动修正 AI 报告」按钮
- 点击执行 `goEditAiReport()`：切换到 AI 报告 Tab 并自动进入编辑态
- 一步直达，不需要用户手动切 Tab 再点编辑

#### 新增状态变量（script setup）

```js
// AI 报告
const aiReportText / editingAiReport / aiReportBuffer / savingAiReport / saveAiError

// 人看摘要
const humanText / editingHuman / humanBuffer / savingHuman / saveHumanError
```

#### 新增函数

```
startEditAi / cancelEditAi / saveAiReport
startEditHuman / cancelEditHuman / saveHuman
goEditAiReport  ← 校验 Tab 入口
```

---

## 四、本次会话的技术障碍与解决

### better-sqlite3 版本不兼容

- **现象**：`npm start` 报 `ERR_DLOPEN_FAILED`，NODE_MODULE_VERSION 137 vs 127
- **原因**：Node.js 版本升级（现在是 v22.20.0），better-sqlite3 的 .node 文件是旧版本编译的
- **解决**：`cd server && npm rebuild better-sqlite3` → `rebuilt dependencies successfully`

---

## 五、当前运行状态

- **后端**：`http://localhost:3000`（PID 16592）
- **前端**：`http://localhost:5173`（PID 11480）
- **数据库**：`E:/gs615/claude-vision.db`（SQLite WAL）

---

## 六、TODO 现状（截至本次会话结束）

全部已完成，TODO.md 已清空待做项。

---

## 七、RAG-lite 功能实现（第二轮会话，2026-06-15）

本轮是在上轮基础上继续（上下文压缩后接力），完成了 chatGPT.md 里提到的"案例库 + 场景分类 + 预检"三项功能。

### 数据库层

- `db.js`：新增 `cases` 表（id / report_id / video_name / scene_type / platform / strategy / prompt_text / created_at）+ 索引 `idx_cases_scene`
- 迁移：`ALTER TABLE tasks ADD COLUMN scene_type TEXT`
- `case.model.js`（新文件）：`create()` / `findSimilar(sceneType, platform, limit)` / `list()`
  - `findSimilar` 按 scene_type 精确匹配 OR location 前缀模糊（`outdoor_%`）
- `task.model.js`：新增 `updateSceneType(id, sceneType)` 方法

### analysis.service.js

- `extractSceneType(aiReport)` — 关键词匹配，返回 `outdoor_dual`、`indoor_single` 等格式
- `checkPrompt(promptText)` — 规则预检，返回 `[{level, msg}]`：
  - 台词字数估算 → 时长（>10s 标 warn）
  - 禁用手势词
  - 字幕风险（台词>30字未写"禁止字幕"）
  - 表演词
  - 书本镜像提示
- `generateDoubaoPrompts()` 新增参数 `sceneType / platform`：
  - 检索历史同类案例 → 注入为 commonContext 里的"历史成功案例"段落
  - 每版返回 `{ strategy, text, checks: checkPrompt(stripped) }`
- `run()` 主流程在 analyzeVideo 后增加：
  - `extractSceneType(aiReport)` + `TaskModel.updateSceneType(taskId, sceneType)` + `onProgress(场景类型)`
  - `generateDoubaoPrompts(..., { sceneType, platform })` 传入场景类型

### reports.route.js

- 顶部引入 `CaseModel`
- `POST /api/reports/:id/adopt-prompt` 采用提示词时：
  - 从 tasks 表拉取 `video_name / scene_type / platform`
  - `CaseModel.create(...)` 写入案例库（供未来 RAG 检索）
  - 同时追加写 `prompt-experiments.md`（原有逻辑保留）

### ReportViewer.vue

- 多版本卡片：提示词正文下方加预检结果 badge 行
  - `warn` → 琥珀色 ⚠ 标签
  - `ok` → 翠绿色 ✓ 标签
  - `info` → 天蓝色 ℹ 标签
- 实现零 API 开销：checks 在后端 AI 调用后立即计算，跟 promptVersions 一起传给前端

### 运作逻辑（闭环）

```
分析视频 → extractSceneType() → findSimilar() → 注入案例 → 生成提示词 → checkPrompt()
        ↑                                                                         ↓
用户采用某版本 → CaseModel.create() 写入案例库 ←─────────────────────────────────┘
```
案例越积累，下次同类场景生成质量越高；首次无案例时正常生成，不报错。

---

## 八、优化1：案例库 bad 排除（2026-06-15 第三轮）

### 问题
用户"采用"某版本后，该提示词存入 cases 表。但后来用豆包生成视频发现效果差，标"太差"时只写 feedback 表，cases 表里的坏案例依然会被未来 `findSimilar()` 检索并注入，污染生成质量。

### 改动

**db.js** — 迁移：`ALTER TABLE cases ADD COLUMN status TEXT DEFAULT 'active'`

**case.model.js**
- `findSimilar()` 加 `AND (status IS NULL OR status = 'active')` 过滤
- 新增 `markBad(reportId, strategy)` — `UPDATE cases SET status='bad' WHERE report_id=? AND strategy=?`

**reports.route.js**
- `POST /api/reports/:id/feedback` 接收新字段 `strategy`
- rating === 'bad' 时调 `CaseModel.markBad(reportId, strategy)`

**ReportViewer.vue**
- `submitFeedback()` 调用时加 `strategy` 字段传给后端

### 效果
坏案例会在 cases 表被标为 `status='bad'`，下次 `findSimilar()` 自动跳过，不再污染后续生成。

---

## 九、优化2：场景分类细化（2026-06-15 第三轮续）

### 问题
旧格式 `outdoor_dual` 无法区分"户外跟拍有书"和"户外固定无书"，检索到的历史案例参考价值有限。

### 改动
**analysis.service.js** — `extractSceneType()` 新格式：`{loc}_{chars}_{prop}_{motion}`

| 维度 | 取值 | 判断关键词 |
|---|---|---|
| loc | outdoor/indoor/warehouse/other | 同旧版 |
| chars | dual/single | 同旧版 |
| prop | book/noprop | 书/课本/教材/绘本/杂志 |
| motion | tracking/fixed | 跟拍/手持跟随/边走边… |

示例：`outdoor_dual_book_tracking`（户外双人有书跟拍）

### 兼容性
`findSimilar()` 的 location 前缀兜底（`outdoor_%`）自动匹配新格式，旧数据库里的 `outdoor_dual` 也会被 `outdoor_%` 捞出来，不会断层。

---

## 十、优化3：策略智能排序（2026-06-15 第三轮续）

### 问题
每次分析都固定按 [动作骨架版, 场景增强版, 完整复刻版] 顺序输出，即使用户90%选同一版，其他两版也白跑（3个独立 AI 调用）。

### 改动

**case.model.js** — 新增 `strategyStats(platform)` 方法，查 cases 表按策略统计采用次数，返回 `{策略名: 次数}` 对象。

**analysis.service.js** — `generateDoubaoPrompts()` 生成前：
```js
const stats = CaseModel.strategyStats(platform);
const orderedStrategies = [...STRATEGIES].sort(
  (a, b) => (stats[b.name] || 0) - (stats[a.name] || 0)
);
```
用排序后的 `orderedStrategies` 替代固定的 `STRATEGIES`，被采用最多的策略排第一。

### 效果
- 积累案例前：保持原顺序（三版均为 0，sort 稳定不变）
- 积累后：用户偏好的版本总是第一张卡，减少翻找

---

## 十一、优化4：只重跑提示词入口（2026-06-15 第三轮续）

### 问题
提示词不满意时，用户只能重新上传视频（重跑完整分析，约 2-5 分钟）。实际上 AI 报告没问题，只需要重跑 `generateDoubaoPrompts`，开销是原来的 1/10。

### 改动

**analysis.service.js** — `generateDoubaoPrompts` 加入 `module.exports`。

**server/src/routes/tasks.route.js** — 新端点 `POST /api/tasks/:id/regenerate-prompts`：
- 从 task 拿 `ref_images_json / script_mode / script_json / scene_type / platform`
- 调 `generateDoubaoPrompts(report.ai_report, {...})`
- 更新 report 的 `doubao_prompts_json` + `doubao_prompt`，返回更新后的 report

**client/src/api/tasks.api.js** — 新增 `regeneratePrompts(taskId)` 方法。

**ReportViewer.vue**：
- 新增 `localVersions` ref（重新生成后覆盖 props 的版本，不需要刷新页面）
- `promptVersions` computed 优先读 `localVersions`
- 新增 `regenerating / regenError` 状态
- 新增 `regeneratePrompts()` 函数
- 多版本卡片底部新增「重新生成提示词」按钮（带旋转 loading 图标），与「打开豆包」并排

### 效果
用户点「重新生成提示词」→ 后台约 15s 重跑 3 版 AI 调用 → 卡片就地刷新，不离开页面。

---

## 十二、优化5：音轨增强自动重试（2026-06-15 第三轮续）

### 问题
CLAUDE.md 里有音频增强流程，但服务端只在 CLI 手动操作，video-analyzer.js 遇到模型报"听不到"时没有自动重试。

### 改动
**server/src/lib/video-analyzer.js**：

新增两个工具函数：
- `enhanceAudio(inputPath, onProgress)` — ffmpeg 降噪+人声频段滤波，输出 `*_voice.mp4`
- `modelCannotHear(text)` — 检测模型输出中是否含"听不到/无法听到/听不清/音频不可用"等关键词

直传模式 `callDashScope` 返回后加判断：
```
result = await callDashScope(...)
if (modelCannotHear(result)):
  enhanceAudio → 重跑一次 callDashScope
  如果重跑后不再报"听不到" → 返回增强后的结果
  否则 → onProgress 警告，返回原结果（台词段精度有限）
```

### 效果
- 全自动：用户不感知，进度 SSE 里会出现"音轨增强中"提示
- 单次重试不循环，防止无限重跑
- 增强失败（ffmpeg 不可用）时安全降级，不影响原流程

---

## 十三、提示词人工评审功能（2026-06-15 第四轮）

### 背景
用户想在不生成视频的情况下，直接对提示词写评审意见（"哪里不对、为什么"），积累后提炼规则写入 CLAUDE.md。

### 后端改动

**db.js** — 新建 `reviews` 表：
`id / report_id / strategy / prompt_text / review_text / created_at`，索引 `idx_reviews_report` + `idx_reviews_created`

**server/src/models/review.model.js**（新文件）：
- `create({reportId, strategy, promptText, reviewText})`
- `listByReport(reportId)` — 某报告的所有评审
- `listRecent(limit)` — 最近N条（含 video_name JOIN）

**reports.route.js** — 新增3个端点：
- `POST /api/reports/:id/reviews` — 提交评审，同步追加 prompt-experiments.md
- `GET /api/reports/:id/reviews` — 某报告所有评审
- `GET /api/reports/reviews/recent` — 最近N条（规则提炼用）

**reports.api.js** — 新增 `submitReview / getReviews / getRecentReviews` 方法；`submitFeedback` 补 `strategy` 参数

### 前端改动

**ReportViewer.vue** — 每版提示词卡片底部新增评审区：
- 3行 textarea（placeholder 有示例）
- "提交评审"按钮（空文本禁用）
- 提交成功显示"✓ 已记录"3秒后消失
- 状态：`reviewBuffers / submittingReview / reviewResults`（均为 index 索引的对象）
- 新增函数 `submitReview(index, v)`

**HistoryView.vue** — 加 Tab 切换：
- "任务记录" Tab（原有内容）
- "评审记录" Tab：列出最近50条评审，显示策略名/视频名/提示词摘要/评审意见/时间
- 切换到评审 Tab 时懒加载数据

### 使用流程
上传视频 → 看3版提示词 → 每版下方写评审意见 → 提交 → 历史页"评审记录"Tab 翻看 → 积累后告诉我"帮我提炼规则" → 写入 CLAUDE.md

---
## Docker 化部署（完成）

### 新增文件
- Dockerfile — 多阶段构建：Stage1 构建 Vue 前端，Stage2 node:22-alpine + ffmpeg + better-sqlite3 编译，生产模式由 Express 托管 client/dist
- docker-compose.yml — 单容器，挂载3个卷（claude-vision.db / reports/ / server/uploads/），env_file 读 server/.env
- .dockerignore — 排除 node_modules / client/dist / .env / .git / uploads / reports

### 解决的问题
- better-sqlite3 原生模块跨 Node.js 版本不兼容 → Docker 内固定 Node 22，原生模块在容器内编译
- 公司/家庭切换带项目无需关心 Node 版本

### 使用方式
确保 server/.env 有 DASHSCOPE_API_KEY，然后：
```
docker compose up -d        # 启动（首次会自动 build，约3-5分钟）
docker compose stop         # 停止（数据安全，卷挂载）
docker compose up -d --build  # 代码更新后重新构建并启动
```
访问 http://localhost:3000

### 本地开发
平时开发仍用两个 PowerShell 窗口：
- server/: node app.js
- client/: npm run dev（访问 localhost:5173）
