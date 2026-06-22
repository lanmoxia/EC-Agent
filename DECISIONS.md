# 方案与决策台账（讨论中 / 在建）

> **用途**：记录"正在讨论、或已定方向但还没做完"的需求与方案。专治会话在**讨论阶段**中断、
> 接力日志接不回当时思路的问题。下次打开先读本文件，就能精确接回"在讨论什么、已定了什么、还差哪些岔路"。
>
> **与其他文件分工**：
> - `conversation-log-*.md` = 每日流水账（发生了什么，按时间追加）
> - `TODO.md` = 任务清单（要做的事）
> - **本文件** = 按需求的活台账（方案/决策/待定/状态，就地维护，随讨论更新）
>
> **维护规则**：讨论一出方向就更新对应条目；每做一个决策记一条；动工改状态并记 commit；
> 完成移到「已完成归档」（不删，沉淀）。摘要接力(conversation-log)照常做，二者并行。

**状态图例**：🟡 讨论中 · 🔵 已定待建 · 🟢 建设中 · ✅ 已完成（归档）

---

## 🟡 投喂成功提示词（用户主动反馈入口，2026-06-21 讨论中）

**需求/背景**：用户日常做视频很忙，会把**做成功**的提示词投喂回来沉淀。一条素材含：提示词(豆包或可灵) + 对标视频 + 用户用该提示词生成的视频。痛点＝忙时只有时间贴提示词，没时间传两个视频 → **提示词先交，视频later在历史记录里补**。

**架构定位（关键）**：这正是题材系统**第②层 RAG 等的"正样本数据源"**（DECISIONS 里"等某题材攒够3-5条真实样本"）。不做孤立功能，要接进学习系统：消费者有两个——①**我(Claude 对话里)** 直接读这些投喂学习 ②**站内第②层 RAG**（需 experiments 行 + 题材指纹）。

**已查实（现有结构）**：
- 首次上传入口＝HomeView 两张折叠卡(豆包/可灵)各内嵌 `VideoUploader`(拖拽+参考图+台词)。
- 顶部导航仅「上传 / 历史记录」(App.vue)；路由 `/`、`/tasks/:id`、`/history`。
- `experiments` 表是 **append-only**(Codex 评审反复强调，不可改行)；现 kind：system_gen/user_review/adopt/compare_feedback。
- 视频文件走 multer 存上传目录(同 tasks)。

**已定决策（2026-06-21 与用户讨论拍板）：先干净解耦收集，后期再整合**
- 理由：现有 4 套反馈(experiments/reviews/feedback/cases)全是"**系统分析→用户反应**"闭环、挂 report_id；本功能是**反方向**(用户从外部带成功提示词+视频，无分析任务、无report_id、生命周期是先交后补)。硬塞 experiments 要处处特判 → 乱。
- **更关键**：整合目标"第②层 RAG"**现在还没建**(等攒数据)，现在 emit 是耦合不存在的消费者 = 过早优化。
- 现有 4 套反馈机制清单：experiments(append-only账本:system_gen/user_review/adopt/compare_feedback) · reviews(人工评审) · feedback(好/一般/太差) · cases(RAG空壳)。

**落地方案（先收集，物理隔离）**：
- **后端**：自包含**可变表 `prompt_feedings`**：id/platform/prompt_text/target_video_path/generated_video_path/note/status(prompt_only|complete)/created_at/updated_at。
  - 加 2 个**未来桥接钩子列**(先留空不填)：`topic_fingerprint`、`linked_experiment_id` —— 等第②层动工再设计 emit/迁移，一行 ALTER 即接上，现在不损失。
  - **不**碰 experiments、**不**自动分析、**不**算指纹。短期消费者＝**我(Claude 对话直接读)**。
  - 路由 POST/GET/GET:id/PATCH:id。
- **前端**：新导航「投喂」+ 路由 `/feed`：上＝豆包/可灵 tab + 提示词框 + 提交(prompt-only 即存)；下＝可选两 tab 视频上传(对标/生成，复用 VideoUploader UI，可跳过)。历史投喂记录点进去补/换两视频。

**剩余小岔路（已定 2026-06-21）**：
3. ✅ **投喂列表** = `/feed` 页自带列表(自包含，与现有历史隔离)。点列表项进详情补/换两视频。
4. ✅ **提示词输入按平台分**：豆包＝单文本框(一段)；可灵＝**多分镜框 + 「添加分镜」按钮**(点一下出一个框，可加镜)。
   → 落库 prompt 需按平台分结构：豆包存整段；可灵存**分镜数组**(prompt_json) + 拍平文本(prompt_text 供我读/展示)。
- (岔路1自动分析深度、岔路2落库方式：已被"先解耦收集"决策吸收——v1 不分析、独立表不 emit。)

**最终落地清单（待用户放行开建）**：
- 后端：① db.js 加 `prompt_feedings` 表(id/platform/prompt_text/prompt_json/target_video_path/generated_video_path/note/status/created_at/updated_at + 留空桥接列 topic_fingerprint/linked_experiment_id) ② `feeding.model.js`(CRUD) ③ `feedings.route.js`(POST 建/GET 列表/GET:id/PATCH:id 补视频) + app.js 挂载 ④ multer 复用上传目录。
- 前端：① 路由 `/feed` + App.vue 导航加「投喂」 ② `FeedView.vue`(上:豆包/可灵 tab+提示词输入[豆包单框/可灵多分镜+添加按钮]+提交; 下:可选两 tab 视频上传复用 VideoUploader; 底:投喂列表带状态徽章) ③ `FeedDetailView.vue` 或弹层(补/换对标+生成视频) ④ `feedings.api.js`。

**已建成（2026-06-22，本轮"稳健推行"）**：
- 后端：db `prompt_feedings` 表(含 2 桥接列留空) + `feeding.model.js`(create/list/findById/update,自动算 status) + `feedings.route.js`(POST/GET/GET:id/PATCH:id, multer 双视频字段 targetVideo/generatedVideo) + app.js 挂载 `/api/feedings`。
- 前端：`VideoPicker.vue`(共享拖拽选视频) + `feedings.api.js` + 路由 `/feed`、`/feed/:id` + App.vue 导航「投喂」 + `FeedView.vue`(豆包单框/可灵多分镜+「添加分镜」+可选两 tab 视频+备注+提交+列表) + `FeedDetailView.vue`(只读提示词+补/换两视频+状态自动转 complete)。
- 验收：后端 curl 建/列表/补视频全过；中文 UTF-8 直读 DB 确认(之前乱码=Git Bash curl -F 编码问题，非服务端)；client lint 0 错 + `npm run build` 全编译过；经 :5173 代理 E2E 建一条通过；测试数据已清空。

**增强：可灵按分镜上传（2026-06-22 本轮，用户提需求并验收）**：
- 痛点：原结构豆包/可灵**共用单对标+单生成**，装不下可灵「每镜一个生成视频 + 每镜一段对标」，丢失分镜级对应（第②层按镜 diff 学习的关键数据）。
- 已定（与用户确认）：豆包不变(1对标+1生成)；可灵=**顶部整段对标(可选) + 每镜(对标分段 + 生成视频)**，第 i 镜 ↔ 第 i 段对标 ↔ 第 i 个生成，1:1；整段+分段**同时都要**；视频全可选先交后补。
- 落地（**不改 schema**，复用列）：整段对标→`target_video_path`；每镜视频塞进 `prompt_json` shot 对象 `{index,text,targetSegment?,generated?}`；可灵顶层 `generated_video_path` 留空。`computeStatus` 改按平台(可灵=整段或每段齐 且 每镜都有生成→complete)。
- 改动文件：`feeding.model.js`(parseShots+按平台status) · `feedings.route.js`(multer.any + 字段白名单 `targetVideo/generatedVideo/klingTarget_i/klingGen_i` + `mergeKlingShots` 合并/PATCH保留未传镜) · `db.js`(注释) · `FeedView.vue`(可灵每镜内联两 VideoPicker + 顶部整段) · `FeedDetailView.vue`(可灵按镜补/换)。`VideoPicker.vue`/`feedings.api.js` 原样复用。
- 验收：server+client lint 0错 + client build 过；curl 三连(可灵3镜全齐→complete/1:1正确、豆包不变、PATCH补单镜仅该镜变其余保留)全过；测试数据已清(表 0 条)。**未提交，等用户放行。**

**待续(未来，不阻塞)**：第②层动工时经桥接列 topic_fingerprint/linked_experiment_id 设计"投喂→题材账本"整合；uploads 静态服务以便页内预览视频(现仅存+显示文件名)。

**现状**：🟢 已建成跑通 + 可灵按分镜上传已增强(本轮)；等用户实测使用，整合留待第②层。

---

## 🟢 VSCode 内自动打开前端页面（folderOpen 真全自动，2026-06-22 落地待验证）

**需求**：用户要「起完前后端后，在 VSCode 内打开前端页面」（不弹外部 Chrome）。

**走过的弯路（如实记，避免重蹈）**：先以为 `workbench.browser.openLocalhostLinks` + 终端 echo 链接能自动弹——错。核实官方：该开关只改「**点击** localhost 链接走内置浏览器」的点击行为，不自动弹；且 Claude 命令输出不进 VSCode 可视终端缓冲区，link 扫描器扫不到。

**已定方案（用户 AskUserQuestion 选「真全自动」）**：`.vscode/tasks.json` 的 **folderOpen 自动任务**——打开/重载项目 → 自动起前端 dev server → ready 后内置浏览器(`simpleBrowser.show`)自动开 `http://localhost:5173`。
- 架构调整：**前端启动归属从 Claude 改到 VSCode 任务**；Claude 启动清单只起后端+验活（已改 CLAUDE.md 第5-6步）。
- `settings.json`：`task.allowAutomaticTasks:on` + `openLocalhostLinks:true`(仅辅助)。

**落地文件**：`.vscode/tasks.json`(新建：dev:frontend + open-frontend-in-vscode) · `.vscode/settings.json`(新建) · `CLAUDE.md`(第5-6步)。

**待验证（用户 Reload Window 触发，会重启会话）**：首次点「Allow and run」→ 前端自动起 + 内置浏览器自动弹 5173。风险：① `simpleBrowser.show` 在 1.123 是否仍有效 ② problemMatcher `Local:.*5173` 是否匹配 Vite 输出。**未提交，验证通过再 commit。**

**现状**：🟢 已落地，等用户 Reload 验证。

---

## 🟡 视频去硬字幕功能（用户新需求，2026-06-19 讨论中）

**需求**：用户上传视频 → 消除字幕。痛点"去字幕非常难"——多为**硬字幕(烧进像素)**，非删字幕轨。

**已查实**：
- 本质 = AI inpainting（检测字幕区→遮罩→重绘背景），非简单删除。ffmpeg 只能粗暴模糊/遮盖(delogo/crop)，不是真去除。
- 最佳开源方案 = **video-subtitle-remover (VSR, YaoFANGUK)**：PaddleOCR 检测 + STTN/LAMA/ProPainter 修复，100% 本地、无第三方 API、无损分辨率。
- 本机条件够：GPU RTX5050(8GB) / Python3.10.11 / pip23 / ffmpeg8.1.1。

**风险/待定**：
- RTX5050 是全新 Blackwell(50系)，paddle/torch 的 CUDA 支持可能要特定/较新版本，最坏退 CPU(慢)——**主风险，需实测**。
- 质量非 100%：固定位+简单背景(用户典型小区/室内场景)通常干净；复杂/运动背景可能涂抹。
- 落地形式待定：①先装VSR+实测一条真实视频(推荐,先de-risk) ②整合进Web新任务类型 ③仅帮装自用。

**de-risk 发现（2026-06-19）**：
- ✅ 作者**官方支持 50 系显卡**：README 明确 `# Nvidia 50系显卡` 用 cuda-12.8 版（预编译.7z + Docker镜像 `eritpchy/video-subtitle-remover:1.4.0-cuda12.8`）。Blackwell 兼容风险已由作者解决。
- ✅ VSR 源码已克隆到 `E:/video-subtitle-remover`（1.7G）。驱动支持 CUDA 13.3。
- ❌ GitHub release **只有 CPU 安装包**（Win CPU 731MB / mac 961MB）；**GPU 预编译.7z 仅在网盘**（需用户手动下，多 G）。
- ✅ 本机 Docker 29.5.3 已装并运行 → Docker cuda-12.8 镜像是**可全程自动化的 GPU 路径**（需先验 WSL2 GPU 直通）。
- ⚠️ 预编译包/源码装都要 Python 3.12（本机 3.10）；Docker 路径自带环境，绕过。

**三条候选路径**：① Docker cuda-12.8 镜像(可自动化GPU，先150MB小镜像验GPU直通再拉大镜像) ② 网盘.7z(用户手动下) ③ CPU安装包731MB(直下、慢、仅验质量)。

**已选路径**：Docker GPU 镜像 `eritpchy/video-subtitle-remover:1.4.0-cuda12.8`（用户 2026-06-19 选定）。

**已完成 de-risk**：
- ✅ WSL2 GPU 直通验证通过（容器内 `nvidia-smi` 见 RTX5050）——Blackwell + 直通双风险清除。
- ✅ VSR 源码克隆 `E:/video-subtitle-remover`；视频样本就位 `E:/desub/in.mp4`（doubao_video_2，720×1280/10s）。
- ⏸ GPU 镜像拉取中途**暂停**（用户"有空再搞"）；Docker 已缓存大部分层，`docker pull` 续下即可。

**恢复步骤（下次接力直接照做）**：
1. `docker pull eritpchy/video-subtitle-remover:1.4.0-cuda12.8`（续完剩余大层）
2. `docker run --rm --gpus all -v E:/desub:/data eritpchy/video-subtitle-remover:1.4.0-cuda12.8 python backend/main.py -i /data/in.mp4 -o /data/out.mp4`
3. 看 `E:/desub/out.mp4` 擦前/擦后质量 → 决定整合形式（CLI/Web）

**现状**：⏸ 暂停（最大风险已通过，等用户有空续跑镜像拉取 + 真实视频实测）。

---

## ✅ 活状态锚点系统（防上下文漂移 · 取代"每句 lanmoxia"）

**背景/痛点**：旧规则"每句回复第一行输出 lanmoxia"是埋在 CLAUDE.md 里的静态文本，会话一长被压到下方、注意力衰减就漏；且静态口令证明不了"真在跟踪上下文"（跑偏也能机械吐出）。

**已定方案（2026-06-19 拍板并落地）**：把"一句话规则"升级成"三层系统"。
- **锚点格式**：每次最终回复第一行 `ANCHOR: lanmoxia | current_task=… | changed=… | next=…`（活状态，不是死口令）。
- **预防层**：output style `Anchor`（`.claude/output-styles/anchor.md`，系统提示词层，比 CLAUDE.md 埋文本强）。
- **兜底层**：Stop 钩子 `.claude/hooks/anchor-check.js`（wrapper `anchor-check.sh` 双机定位 node）——读 transcript 取最后回复+最近用户请求+本轮工具，校验：①有锚点行 ②含 lanmoxia ③current_task 非空话 ④changed 对应本轮真实操作 ⑤next 非空话 ⑥与用户请求关键词非完全不重合；不合格 `decision:block` 打回重答。带 `stop_hook_active` 防循环、fail-open 不卡用户、写时序 sleep 重读。
- **审计层**：每次违规追加 `.claude/anchor-violations.log`（gitignore），把"信任"变成可查数据。
- **空话拦截不承诺 100%**：只用规则拦明显糊弄，语义真实性仍靠模型自觉（已写进规则）。

**已验证（4 例自测，证据见 conversation-log）**：合格放行 / 空话拦截 / 无锚点拦截 / 与请求不相关拦截，全部如预期；violations.log 正确记录。wrapper bash→node 回退分支烟测通过。

**生效说明**：settings.json 已设 `outputStyle:Anchor` + Stop 钩子；**hook/output style 需重启 Claude Code 会话才实际加载**（本会话内已用自测验证逻辑正确）。

**残留缺口（如实记）**：无机制能强制改写模型输出的字；Stop 钩子是事后"检测+逼重答"，补丁是追加而非干净前置。极端情况仍可能漏，但一定被记账。

---

## 🟢 题材化提示词学习系统（diff 驱动 · 按题材累积 · 可毕业固化）

**需求/痛点**：当前"出提示词→评审→沉淀"太零散；缺少按题材积累、从 diff 提炼规则、成熟后固化的闭环。
用户要的是"量变引起质变"——大量实验累积，到某题材稳了就固化成长期模板。

**已定决策**：
1. **粒度=题材指纹**：在现有 `{地点}_{人数}_{道具}_{运镜}` 上加 **关系 + 开场类型** 两维：
   `{地点}_{人数}_{关系}_{道具}_{运镜}_{开场类型}`
   例：`outdoor_dual_fatherdaughter_book_tracking_voiceover-entry`
   （加这两维因为"开场触发方式"是 diff 高发区）
2. **diff 两层、全记录、可检索、append-only 永不删**：
   - A 层 = 我的提示词 vs 用户评审/重写
   - B 层 = 用户上传问题视频 + 主观判断/用户自写提示词
3. **三层架构**：
   - ①逐条捕获（实验档案，地基）：`{题材指纹, 我的v1, 最终满意版, diffA, diffB, 理由, 时间, 关联视频}`
   - ②按题材攒 + 提炼活规则（实时注入提示词生成）
   - ③毕业固化（题材成熟→锁成长期模板/可插拔模块）
4. **毕业判定**：需大量长期实验，**用户说了算**；所有测试数据沉淀不删。
5. **题材做成可插拔模块**（具体机制待看用户调度系统后定）。

**建设中 schema（锁定，2026-06-17 开建第①层地基）**：
- `topic_fingerprint` v2（6维）：`{地点}_{人数}_{关系}_{道具}_{运镜}_{开场类型}`
  - 关系：fatherdaughter/motherchild/couple/colleagues/solo/other
  - 开场类型：voiceover-entry/walk-in/called-turn/direct-talk/effect-transition/other
  - 存 tasks 新列 `topic_fingerprint`，旧 `scene_type` 保留兼容
- `experiments` 表（append-only，每次反馈一行，kind 区分）：
  id/report_id/task_id/video_name/topic_fingerprint/platform/kind/system_prompt/
  user_rewrite/diff_a/problem_video/problem_report/diff_b/user_judgment/reason/
  status(open/satisfied)/created_at
  - 借鉴调度系统经验账本：另设占位思路，毕业用 occurrences 计数（同题材 satisfied 数）+ 用户确认
- 抓取点：① 生成提示词→写 system_gen 行 ② 用户评审/重写→写 user_review 行(diff_a+reason)
  ③ 采用→status=satisfied ④ 对比+反馈→写 compare_feedback 行(diff_b+judgment)

**已完成（第①层地基，本轮）**：
- [x] db 迁移：`experiments` 表 + `tasks.topic_fingerprint` 列
- [x] `experiment.model.js`：append-only create / listByReport / listByFingerprint / listRecent /
      occurrences(按 DISTINCT report_id 去重，毕业计数) / markSatisfied
- [x] `extractTopicFingerprint(report)` 6维，run() 写入 task；导出供复用
- [x] 抓取点①生成→system_gen行 ②评审→user_review行(reason) ③采用→markSatisfied
- [x] 实测：迁移✓、真实报告指纹✓(indoor_dual_fatherdaughter_book_fixed_direct-talk)、occurrences去重✓

**Codex 评审修复（d9f87ec → 本轮，RAG 前必修）**：
- [x] P1 采用改 append `kind='adopt'` 行(不改旧行)，负面 user_review 不再被翻 satisfied
- [x] P1 采用版真正进档案：adopt 行含 systemPrompt(默认版)+userRewrite(实际采用版)+strategy
- [x] P2 开场重排：voiceover-entry 优先，called-turn 只管无入画的回头
- [x] P2 occurrences 改按 video_name 去重(同视频重分析不灌水)；source_video_hash 留作后续硬化

**已完成（diff_b 抓取，本轮）**：
- [x] 抓取点④对比→compare_feedback行：compareAnalyze append(problem_report+diff_b+system_prompt，user_judgment先空)
- [x] reoptimize 带反馈时再 append 一条 compare_feedback(user_judgment+user_rewrite)，不改旧行(append-only)
- [x] 真实接口验收链路全通过(system_gen open / 负面review open / adopt satisfied / 采用版入档 / 去重)

**第②层 RAG 落地方案（2026-06-19 讨论拍板）**：
- **认知澄清**：现有"历史参考注入"(analysis.service.js:276 `CaseModel.findSimilar`)是**空壳**——
  注入的"核心经验"句是**写死的固定字符串**，对任何视频都一样，没从真实 diff 学任何东西。
  第②层的本质 = 把这段硬编码鸡汤，换成从真实评审记录提炼的活经验。
- **✅ 决策1 推进顺序 = 先攒数据再建**：当前库里仅 2 条 system_gen，0 条 adopt/review/compare_feedback。
  RAG 无数据=空转。先回归打磨主线让第①层自动攒真实样本；某题材攒够 **3-5 条**后再建第②层，一上线就有真经验。
- **✅ 决策2 技术路线 = 轻量规则注入**（**不上向量库**）：
  6维题材指纹结构化匹配(精确→粗粒度回退) + 一次 LLM 把同题材历史 diff **蒸馏**成几条活规则 → 注入 generateDoubaoPrompts，
  替换现有空壳 similarCasesNote。向量 embedding 留作数据攒到几百条后的升级方向（避免过度工程）。
- **建设要点（待启动时落地）**：
  · 检索键：用 `topic_fingerprint`(6维)，无命中则放宽到粗粒度(地点+人数+道具)回退
  · 取数：正样本 adopt(user_rewrite) + 修正 user_review(reason) + **负样本 compare_feedback(user_judgment，"别这样")**
  · 提炼：一次 LLM 蒸馏，可选缓存进 topic_rules 表(有新满意样本才重炼，省调用)
  · 触发门槛：题材样本数达标才注入，未达标退回现有写法

**下一步（第②③层，按上方拍板顺序执行）**：
- [ ] **【当前】回归打磨主线攒真实样本**：上传视频→出词→评审/采用/对比反馈，养第①层数据
- [ ] 第②层(轻量规则注入)：某题材攒够 3-5 条后启动；listByFingerprint 提炼活规则 → 注入(替换空壳)
- [ ] diff_a 文本计算(可选硬化：提示词编辑PUT时记 system vs rewrite 的结构化diff；现已存两侧文本可派生)
- [ ] 第③层：evolution 扫描按 occurrences 提议毕业(用户确认) → 固化题材模块
- [ ] source_video_hash 硬化(occurrences 更严格去重)

**现状**：🟢 第①层地基完整(system_gen/user_review/adopt/compare_feedback 四类抓取点全部就位且验收通过)；
🟡 第②层方案已拍板(轻量规则注入+先攒数据)，**等某题材攒够 3-5 条真实样本后启动**；
真实数据待用户跑(满意→adopt，不满意→上传对比→compare_feedback)。

---

## ✅ 借鉴用户的调度系统框架

**需求**：用户有现成调度系统，想借鉴其调度框架到"题材可插拔 / 实验档案 / 毕业固化"上。

**已审路径**：根目录 `产品经理技能包 4.0/`（已加入 `.gitignore`，作为本地参考资料，不进主仓）。

**可借鉴点**：
1. 主控路由：CLAUDE.md 只负责任务路由和生命周期编排，不把领域规则全塞进主流程。
2. 反馈捕获：`detect-feedback-signal.sh` 用关键词捕捉用户修正信号，提醒主 Agent 记录。
3. 经验账本：feedback topic 文件带 `occurrences / graduated / skipped / source_skill`，适合做"规则毕业"台账。
4. 进化扫描：`evolution-engine` 按出现次数提议毕业，但执行前必须用户确认。
5. 隔离执行：sub-agent fresh 实例思想可借鉴为"每次题材实验独立记录上下文"，避免旧判断污染新实验。

**不建议照搬**：
1. 不照搬开发流水线、code review gate、auto-push、端口 kill 等工程项目规则，和本项目的视频提示词任务无关。
2. 不把题材模块一开始做成 Claude Code Skill。当前更适合项目内模块：`topic_fingerprints` + `experiments` + `topic_rules` + `topic_modules`。
3. 不只靠 markdown 做检索。视频实验需要结构化查询，SQLite 是主账本，markdown 只做人看摘要。

**融合结论**：
先实现"结构化 append-only 实验档案 + 题材指纹 v2 + 毕业状态字段"；等某题材规则稳定后，再把它固化成项目内题材模块。Claude Code Skill 只适合未来迁移成跨项目能力时再做。

**现状**：参考系统已审完，结论已落本文件。

---

## ✅ 已完成归档（保留沉淀，详见对应 commit / conversation-log）

- 环境搭建 + 自动 pull 钩子 + 换机机制（`c569740` / SETUP-NEW-MACHINE.md）
- 准确性校验 4 层 + L2 盲审 + 三处优化（误报忽略/定位段落/L3降级）（`3134404` 等）
- 可灵逐镜提示词生成（`d461648`）
- 豆包多账户 + Edge 打开 + 无水印插件（`4b82d71`）
- Codex 监督机制（`a3d33b0` / CODEX-REVIEW-GUIDE.md）
- Codex 评审发现的 5 处 bug 修复（`4fc6e56`）
- 提示词人味写法规则 + 案例库注入改意图摘要（`f289cb7`）
