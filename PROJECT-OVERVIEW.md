# PROJECT-OVERVIEW.md — EC-Agent 项目全貌（长期说明书）

> **这是什么**：整个项目的"静态全貌地图"，给每次新开的 Claude 会话快速建立完整认知用。
> **怎么用**：新会话启动清单**第3步**（pull + 环境检测之后、读最近 conversation-log/DECISIONS 之前）读本文件，**先建立项目全局静态认知**，再读最近日志接回动态进展。即「先看全局静态地图，再看最近动态进展」。
> **维护**：本文件描述的是**稳定的项目结构与设计**，不是流水账。架构/数据流/表结构/端点发生**实质变化**时才更新；日常任务进展仍写 conversation-log / DECISIONS，不要写进这里。
> **最后核对**：2026-06-23（逐文件通读全后端 + 前端/CLI 调研后落地）。

---

## 0. 一句话定位

给短视频电商做「**对标视频 → AI 拆解成结构化报告 → 生成可复刻的提示词（豆包 / 可灵）**」的工具，外加一套「**用反馈反哺提示词质量**」的题材学习系统雏形。

**这是 DEMO/实验项目**，单机运行，重在打磨"分析→提示词"的质量闭环，不是要上线的生产系统。

**Claude 在本项目的角色**（详见 CLAUDE.md「角色边界」）：视频分析 + 提示词输出。收到视频 → 分析 → 9 段报告 → 对应平台提示词。不主动做自动化架构设计、不预判。

---

## 1. 总体架构（三层 + 一套学习系统）

约 8500 行。三层是**同一套能力的不同封装**，不是三个独立系统：

- **CLI 脚本**（根目录，纯 Node 内置模块，无 npm 依赖）：`vision.js` / `video.js` / `validate.js`，命令行直接分析图/视频/校验，是后端 lib 的"原型"。
- **后端 server/**（Express + better-sqlite3 WAL）：REST API + SSE 进度推送，把 CLI 能力封装成 Web 服务。`src/lib` 是 CLI 脚本的"库版本"（加了压缩降级/参考图/台词注入）。
- **前端 client/**（Vue3 + Vite + Tailwind + Pinia）：上传 / 看报告 / 对比 / 投喂 的界面。

所有 AI 能力都打到 **阿里云百炼 DashScope**（OpenAI 兼容 `/chat/completions`），模型 `qwen3.5-omni-plus`（原生多模态：能听音频、看口型、感知节奏）。

**外部依赖只有两个**：① DashScope API（`DASHSCOPE_API_KEY`）② ffmpeg/ffprobe（压缩/抽帧/校验用）。数据库是本地 SQLite 文件，无 Redis、无向量库、无云组件。

### CLI ↔ 后端 lib 对应关系

| CLI 脚本 | 后端库版本 | 库版本多了什么 |
|---|---|---|
| `video.js` | `server/src/lib/video-analyzer.js` | 自动压缩降级(crf28→32→抽帧)、参考图/台词注入、音轨增强重试 |
| `validate.js` | `server/src/lib/validator.js` | 去掉 CLI 包装，供 analysis.service 调用 |
| `vision.js` | （无独立库版，能力并入 analyzer/accuracy 的识图调用） | — |

---

## 2. 核心数据流（一个分析任务怎么跑）⭐ 最重要

`POST /api/tasks`（上传视频+可选参考图+台词）
→ `queue.service`（内存队列，并发上限 `QUEUE_CONCURRENCY` 默认 3）
→ `analysis.service.run(taskId, onProgress)` 主流程，按顺序做 7 件事：

1. **Qwen 多模态感知** `video-analyzer.analyzeVideo()`
   - 视频 base64 直传（硬上限 50MB）；失败/过大 → ffmpeg 压缩 crf28 → crf32 → 仍不行抽帧降级（丢音频）
   - 模型报"听不到音频" → ffmpeg 音轨增强（降噪+人声滤波）重试一次
   - ffprobe 实测时长会注入 prompt 供模型对齐
   - 产出 = **9 段结构化报告**（见 §6）
2. **场景类型 + 题材指纹** → 写回 tasks 表
   - `scene_type`（4维）：`地点_人数_道具_运镜`，旧字段，兼容保留
   - `topic_fingerprint`（6维）：`地点_人数_关系_道具_运镜_开场类型`，题材学习系统主键，正则从报告抽
3. **时间轴校验** `validator.validateTimeline()`：解析 §5 台词时间戳，查顺序错乱/重叠/越界
4. **准确性校验** `accuracy.runAccuracyChecks()`：4 层内容校验（见 §3），矛盾字段会反向注入下一步
5. **生成提示词**（仅原始任务，对比任务跳过）
   - 豆包：`generateDoubaoPrompts()` 3 版策略**并行**（动作骨架版/场景增强版/完整复刻版）
   - 可灵：`parseShots()` 切镜 → `generateKlingPrompts()` 逐镜 × 3 版本（简洁/复杂/详细）
6. **报告落盘** `reports/<视频名>_<日期>.md` + 写 `reports` 表
7. **写 1 条 `system_gen` 实验档案**（题材学习地基）

**进度推送**：每步 `onProgress(msg)` → `queue.service.emit()` → SSE `/api/sse/:taskId` → 前端 EventSource 实时日志。任务结束 emit `done`(reportId) 或 `error`。

### 对比分析链路（验证生成视频像不像）

`POST /api/tasks/:id/compare`（上传生成视频 + "哪里不像"反馈）
→ 创建 `task_type=comparison` 子任务，同样跑分析出报告（但不生成提示词）
→ `POST /api/reports/:id/compare-analyze`：`compareAnalyze()` 让模型 diff 原报告 vs 生成视频报告 → 差异列表，并 append 1 条 `compare_feedback` 实验档案
→ `POST /api/reports/:id/reoptimize`：`reoptimize()` 拿差异+用户反馈重写提示词（用户反馈优先级最高），带反馈时再 append 1 条 `compare_feedback`

---

## 3. 准确性校验 4 层（`accuracy.js`，657 行，项目最讲究的部分）⭐

防的是"模型自说自话/方向颠倒"。每层独立、任一层失败只标 skipped 不影响主流程。开关在 `config.accuracy`（环境变量可逐层关）。

| 层 | 名称 | 做什么 | 成本 |
|---|---|---|---|
| **L1** | groundTruth | ffprobe/ffmpeg **确定性真值**：纠报告 §1 的时长/画幅比例/硬切数（一镜到底误判） | 零模型成本 |
| **L2** | recheck | **盲审比对**：一路从报告抽 12 个致命字段事实表(文本)，另一路只看视频不看报告独立答同样的题(盲审)，程序**逐字段 diff**——两边都确定且不等→矛盾(error)，一边不确定→存疑(warn) | +1 次视频模型调用 |
| **L3** | firstFrame | **首帧单图接地**：抽第0帧当静态图，专核 §2 第一帧构图（左右/象限最易颠倒；静态单图判方向比整段视频准）。矛盾只降级为 warn（入画/跟拍天然不一致） | +1 次 vision 调用 |
| **L4** | ledger | 把标红/标黄字段追加写 `accuracy-issues.md` 台账（发现模型最常错的类型，反哺 prompt 加固） | 文件写入 |

**12 个致命字段**（L2 比对项，`FATAL_FIELDS`）：人物数量、是否一镜到底、镜头数、主体水平位置、入画方向、移动方向、声源画内外、说话人数、声部顺序、是否看镜头、书封面朝向、主镜头运动。

**闭环**：L2 矛盾字段 + 存疑 warn → `buildConflictNote()` 渲染成警示段**注入提示词生成**（"这些字段不可信，别写死，用中性描述或省略"）。验证不只报错，还防错误流进提示词。

---

## 4. 数据库 schema（SQLite WAL，`server/src/models/db.js` 启动幂等迁移）

DB 文件在项目根 `claude-vision.db`（相对 server/ 为 `../../`）。所有 `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN`(try/catch 包裹) 在 `db.js` 启动时跑，**无需手动迁移命令**。

| 表 | 性质 | 关键列 | 用途 |
|---|---|---|---|
| **tasks** | 可变 | id, status, video_name, video_path, platform(douban/kling), task_type(original/comparison), parent_task_id, ref_images_json, script_mode, script_json, scene_type, **topic_fingerprint**, user_feedback | 分析任务主表 |
| **reports** | 可变 | id, task_id, ai_report(9段全文), human_summary, doubao_prompt(默认展示版), **doubao_prompts_json**(豆包3版/可灵逐镜结构), validation_json, accuracy_json | 分析结果 |
| **feedback** | 追加 | id, report_id, rating(adopted/neutral/bad), comment | 提示词版本好坏反馈 |
| **reviews** | 追加 | id, report_id, strategy, prompt_text, review_text | 提示词人工评审日志 |
| **cases** | 可变 | id, report_id, scene_type, platform, strategy, prompt_text, status(active/bad) | RAG 案例库（**目前是空壳**，见 §5） |
| **experiments** | **append-only⚠** | id, report_id, task_id, topic_fingerprint, platform, **kind**, system_prompt, user_rewrite, diff_a, problem_report, diff_b, user_judgment, reason, strategy, status(open/satisfied) | 题材学习系统第①层地基，**永不改行只追加** |
| **prompt_feedings** | 可变 | id, platform, prompt_text, **prompt_json**(可灵分镜数组), target_video_path/name, generated_video_path/name, note, status(prompt_only/complete), topic_fingerprint+linked_experiment_id(桥接列,留空) | 投喂功能：用户带成功提示词+视频回来沉淀 |
| **accounts** | 可变 | id, label, douyin_id, status, is_current, notes | 抖音账号管理 |

**experiments.kind 四类**：`system_gen`(生成提示词时) / `user_review`(人工评审时,带reason) / `adopt`(采用某版时,status=satisfied) / `compare_feedback`(对比反馈时,带diff_b+user_judgment)。

---

## 5. 反馈/学习机制（4 套，分清谁真在工作）

| 机制 | 数据来源 | 消费者 | 状态 |
|---|---|---|---|
| **experiments**（题材账本） | 自动：生成/评审/采用/对比时各 append 一行 | 现：Claude 对话直接读；未来：第②层 RAG | ✅ 四类抓取点都在工作，正攒数据 |
| **prompt_feedings**（投喂） | 用户主动：FeedView 提交成功提示词+视频 | 现：Claude 读；未来：第②层 | ✅ 代码完成（含可灵按分镜上传），**待实测使用** |
| **reviews / feedback**（评审/打分） | 用户在 ReportViewer 点评审/采用/打分 | 写 prompt-experiments.md + experiments | ✅ 工作中 |
| **cases**（RAG 案例库） | 采用提示词时 CaseModel.create | `generateDoubaoPrompts` 注入"历史经验" | ⚠ **空壳**：注入的经验是**写死的固定字符串**(`analysis.service.js:283`)，对任何视频都一样，没从真实 diff 学东西 |

**题材学习系统三层规划**（详见 DECISIONS.md）：
- 第①层 逐条捕获（experiments 表）= ✅ 地基完整
- 第②层 按题材提炼活规则注入提示词 = 🟡 方案已定（轻量规则注入，不上向量库），**等某题材攒够 3-5 条真实样本再建**，届时替换 §5 的写死空壳
- 第③层 毕业固化（题材稳了锁成长期模板）= 用户说了算

---

## 6. 9 段报告结构（`ANALYSIS_PROMPT_BASE`，video-analyzer.js）

报告开头先输出**声部摘要**（如"声部：画外女问→画内女答"），再接 9 段：

1. 视频基础信息（时长/画幅/拍摄类型/**镜头数与硬切判断**）
2. **第一帧精确构图**（最重要：2D动线方向上下+左右、各层象限、角色位置占比朝向、初始体态）
3. 角色外观档案（视觉年龄数字/面容气质日常感/发型/服装逐件/体型/站姿）
4. 光线与色调（光源方向/色温具体/饱和度/主色块位置/天气时段）
5. **时间轴台词**（`M:SS.s-M:SS.s | 说话人 | 画内外 | "台词,//停顿/换气"(语气 语速)`）
6. 动作与道具时序（**书的状态机：闭合→翻开逐次记录**/步态/手势）
7. 镜头运动时序（运动向量方向+速度+起止角度/景别/硬切边界）
8. 场景与背景细节（前中远景各层象限/地面材质/固定道具位置）
9. 复刻风险提示（双人同框/持书/台词密度/镜头难度/超10s）

Qwen 只负责"感知"出 1-9 段；**提示词由独立的文本 AI 调用生成**（不混在分析里）。

---

## 7. REST API 端点全集

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/api/tasks` | 上传视频(+refImages+scriptMode/scriptJson+platform)建分析任务 |
| GET | `/api/tasks` | 任务列表(分页 page/limit) |
| GET | `/api/tasks/:id` | 任务详情 |
| GET | `/api/tasks/:id/comparison` | 该任务最新对比子任务 |
| POST | `/api/tasks/:id/compare` | 上传生成视频建对比任务(+feedback) |
| POST | `/api/tasks/:id/regenerate-prompts` | 只重跑提示词，不重新分析视频 |
| GET | `/api/reports` `/:id` `/by-task/:taskId` | 报告列表/详情/按任务查 |
| PUT | `/api/reports/:id` | 编辑报告(ai_report/human_summary/doubao_prompt) |
| POST | `/api/reports/:id/compare-analyze` | diff 两份报告出差异列表 |
| POST | `/api/reports/:id/reoptimize` | 据差异+反馈重写提示词 |
| POST | `/api/reports/:id/adopt-prompt` | 采用某版→写库+案例库+经验日志+adopt档案 |
| POST | `/api/reports/:id/feedback` | 版本打分(adopted/neutral/bad) |
| POST/GET | `/api/reports/:id/reviews` | 提交/查人工评审 |
| GET | `/api/reports/reviews/recent` | 最近N条评审(规则提炼用) |
| GET | `/api/reports/export/feedback` | 导出反馈 JSON |
| POST/GET/GET/PATCH | `/api/feedings` `/:id` | 投喂 建/列表/详情/补视频(可灵按分镜) |
| GET/POST/PATCH/POST/DELETE | `/api/accounts` ... `/:id/activate` | 抖音账号 CRUD + 设当前 |
| GET | `/api/sse/:taskId` | SSE 进度推送(EventSource) |
| GET | `/api/system/edge-profiles` | 列 Edge 多账户 Profile |
| POST | `/api/system/open-edge` | 用指定 Edge Profile 打开豆包(后端拉起本地浏览器) |
| GET | `/api/health` | 健康检查 |

---

## 8. 前端结构（client/）

**路由 5 条**：`/` HomeView(选平台+上传+最近任务) · `/tasks/:id` TaskView(SSE进度+报告) · `/history` HistoryView(任务列表+评审记录+导出) · `/feed` FeedView(投喂) · `/feed/:id` FeedDetailView(补视频)。

**核心组件**：
- `ReportViewer.vue`（1173行，最大）：5 Tab = AI报告/人看摘要/提示词(豆包多版或可灵逐镜)/准确性校验(L1-L3+误报驳回)/时间轴校验；四种编辑态；Tab 滚动记忆(localStorage)；侧挂书签反馈按钮
- `VideoUploader.vue`：拖拽上传 + 参考图(≤5张带标签:干净场景/书/角色/有角色场景) + 台词三模式(单人/多人对话/画外音)
- `CompareUploader/Viewer`：上传生成视频 → 自动差异分析 → 自动重新优化提示词 → 同步回 ReportViewer
- `FeedView/FeedDetailView`：豆包单框 vs 可灵(整段对标+每镜对标分段+每镜生成视频，1:1)
- `EdgeDoubaoLauncher.vue`：列 Edge 多账户，一键用对应豆包账号登录态打开(配 doubao-nomark 无水印插件)，状态/标签存 localStorage

**API 层**：`axios.js` 响应拦截器自动取 data 字段；`tasks/reports/feedings.api.js` 分封端点。状态：`task.store`(Pinia) + `useSSE`(进度订阅) + `useUpload`(上传进度)。设计系统：Tailwind + CSS变量token(light/dark) + cva 管 Button/Badge 变体。

**前端开发**：`cd client && npm run dev`（:5173，/api 代理到 :3000）。生产模式后端从 `client/dist` 服务静态文件。

---

## 9. 基建 / 部署 / 自动化

- **Docker 一键起**：`docker-compose up --build`（前提 server/.env 有 Key）。多阶段构建：阶段1 build 前端 → 阶段2 node22-alpine+ffmpeg+python3 跑后端，挂载 db/reports/uploads 持久化。
- **setup.ps1**：新机环境自检（nvm-windows / Node22 / server.env / 双端 node_modules），缺啥补啥。**换机只需跑一次**。
- **Node 必须 22**（better-sqlite3 原生模块，切 24 会崩）。
- **锚点强制系统**（`.claude/hooks/anchor-check.js` + output-style `anchor.md`）：Stop 钩子校验每次回复第一行 ANCHOR 活状态锚点(current_task/changed/next 真实具体、含lanmoxia、与本轮请求相关)，违规打回重答 + 记 `anchor-violations.log`。
- **session-git-pull 钩子**：SessionStart 自动 git pull(有未提交改动则跳过) + 注入 DECISIONS.md/最近 conversation-log 尾部。
- **progress-writer 钩子**（`.claude/hooks/progress-writer.js`，Stop）：每轮把锚点 + 工作树脏文件写进 `PROGRESS.md` 并单独 commit/push。与 `TASKS.md`(任务三态台账,"进行中"＝当前指针) 组成"防中断/防失忆"进度追踪：L1 钩子写实时位置、L2 我维护任务台账+完成即推送、L3 log/DECISIONS 叙事（详见 CLAUDE.md「进度追踪 + 任务完成即接力推送」）。

---

## 10. 关键文件索引（要改东西时从这里找）

| 想动什么 | 看这个文件 |
|---|---|
| 分析主流程/提示词生成/对比/题材指纹 | `server/src/services/analysis.service.js` ⭐ |
| Qwen 调用/压缩降级/9段分析prompt | `server/src/lib/video-analyzer.js` |
| 准确性校验4层 | `server/src/lib/accuracy.js` |
| 可灵切镜/逐镜提示词 | `server/src/lib/kling.js` |
| 时间轴校验 | `server/src/lib/validator.js` |
| DB 表结构/迁移 | `server/src/models/db.js` |
| 队列/并发/SSE emit | `server/src/services/queue.service.js` |
| DashScope HTTP 封装 | `server/src/lib/dashscope.js` |
| 报告展示/编辑/反馈 UI | `client/src/components/business/ReportViewer.vue` |
| 提示词撰写规范/角色边界/启动清单 | `CLAUDE.md` ⭐ |
| 在建方案/讨论台账 | `DECISIONS.md` |
| 当前在做第几个任务(三态台账) | `TASKS.md` |
| 当前任务做到哪步/哪些文件没存(钩子自动写) | `PROGRESS.md` |
| 提示词实验结论沉淀 | `prompt-experiments.md` |
| 待办(大方向工程拆解) | `TODO.md` |

---

## 11. 已知半成品 / 没接通（如实记录，别当成已完成）

- **第②层 RAG = 写死鸡汤**：`cases.findSimilar` 注入的"历史经验"是固定字符串，未接真实 diff（已决策：先攒数据，3-5条/题材后再建）
- **可灵→实际生成视频闭环未打通**：kling.js 只出提示词；LibTV CLI 的抽帧/上传/角色绑定/逐镜生成/帧接续/拼接整条线全是 TODO（TODO.md 最高优先级）
- **VSR 去硬字幕**：Docker GPU 路径已 de-risk（WSL2 直通验证过），镜像拉取暂停中（DECISIONS.md 有恢复步骤）
- **投喂功能**：代码完成已 commit，**未实测使用**
- **时间轴校验有错后无"一键修正"入口**（TODO.md）
- **ReportViewer 编辑态**：UI 已实现，边界情况未充分测

---

## 12. 经验沉淀（已验证写进规则的提示词铁律）

详见 CLAUDE.md「提示词撰写规范」+ prompt-experiments.md。三条核心（已复现≥2次）：
1. **白话叙事 > 指令格式**：像跟朋友描述脑子里的画面，不写【中括号】结构说明书
2. **参考图越少越好**：只给干净场景图+道具书图，**绝不给含角色的原视频截帧**（角色截帧会让模型抄原版外观/镜头，盖过文字描述）
3. **道具书写成"状态机"**：闭合(封面图)→台词触发硬切→翻开(内页图)，不是静物
- 切镜用**台词触发**不用秒数；Seedance 两个必写禁词：书封面"不要镜像"、长台词"禁止字幕"
- 提示词目标 ~100字 ~5条约束，失效时先删约束再改方向，不叠加修复
