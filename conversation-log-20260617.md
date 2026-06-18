# 会话记录 2026-06-17

> 续 6-16。环境/同步机制/可灵/豆包多账户/准确性校验 等见 conversation-log-20260616.md。

## 准确性校验三处优化（已提交 3134404）
- P1 L3 首帧接地：prompt 加"人物入画/跟拍首帧天然不一致，只抓静态硬矛盾"，矛盾降为 warn 不再 error
- P2 误报忽略：finding 加"报告无误·忽略"，移折叠区不计 verdict，可撤销，存本机 localStorage
- P3 点击定位：finding 带段号，点"§N 定位"跳报告对应段高亮；renderReport 加 data-sec
- 起因：用户反馈 L3 把"女儿稍后入画"误判矛盾；报告其实没错

## 自动pull钩子修复（已提交 c569740）
- 钩子改为只看「已跟踪文件」改动（`--untracked-files=no`），未跟踪文件（如 codex 的 .codex/AGENTS.md）不再误拦 pull

## Codex 评审发现的5处bug修复（已提交 4fc6e56）
用户引入 Codex 当评审员，发现并已修：
1. 时间轴校验抓 §3 应为 §5（validator.js+validate.js）——台词时间轴此前没被校验
2. 对比反馈没进优化：新增 tasks.user_feedback 列，compare存→TaskView传→CompareViewer→reoptimize 真采用
3. comparisonReportId 前端 api wrapper 丢失 → 转发，后端缓存差异
4. prompt-experiments.md 硬编码 E:/claude-vision-skill → 改 path.dirname(config.reports.dir)，gitignore
5. regenerate douban 默认版本 [0] → [1]||[0]，与 run() 一致

## Codex 监督机制（已提交 a3d33b0）
- 新建 CODEX-REVIEW-GUIDE.md：Codex 评审章程
- AGENTS.md + .codex/ 已提交共享，家里那台 git pull 可用 Codex 评审

## 启动服务加入CLAUDE.md启动清单（本次新增）
- 新会话启动第5步：自动后台启动前后端（:3000/:5173），验活后告知用户

## 提示词评审实战（本次核心）

### 工作方式确认
- 评审就在对话里进行，不需要 SSE 或新功能
- 用户看视频后用自然语言描述，不做正式评审
- 我接收、理解、迭代，学到的东西沉淀进规则

### test.mp4 实战（户外步道+画外音+道具书）
- 视频 14.7s，声部：画外男问 → 画内女答
- 系统生成3版，前两次生视频：有橙色衣服但无固定镜头
- 用户手改提示词，舍弃橙色（为美观，非参考学习），加"第一人称视觉"
- 最终生成视频（生成视频(3).mp4，10.1s）：一镜到底✅、台词完整✅、被叫住自然感✅

### 关键发现（已写入规则）

**1. "第一人称视角"是独立关键词**
- 之前只有"手持手机镜头"
- 加了"第一人称视觉"后，视角变成路人拿手机遇到这个人，不是拍摄者拍表演
- 自然感显著提升，被叫住那一刻尤其真实

**2. "镜头跟随固定近景" > "硬切至固定近景"**
- 系统写"随后硬切至固定近景"→ 生成视频无固定镜头
- 用户改成"镜头跟随固定进景"→ 一镜到底，跟拍平滑过渡到固定

**3. 案例库死记问题**
- 案例库把"硬切镜"原文注入，模型死记，不管什么场景都硬切
- 修复：注入意图摘要（"此类场景曾成功，核心经验是自然触发链"），不注入原文

**4. 人味写法：情境→人的反应→镜头跟着走**
- ✅ "被画外人叫住，女子侧身回头说"（有原因，动作自然）
- ❌ "角色向镜头方向转身"（无原因，像演员按剧本）
- 触发词：被叫住、被喊住、侧身回头、停下来

**5. 镜头词汇表（用户实际使用的那套）**
- 手持手机（微晃）/ 第一人称视角 / 固定镜头 / 镜头跟随固定近景
- 轻微俯视/仰视 / 前推 / 回拉 / 左右横移 / 镜头跟随角色

**6. 风格锚点有效**
- "邻居种草推荐风格" 比无风格锚点约束整体气质更好

### 已修改文件
- `CLAUDE.md`：提示词规范加"人味写法"章节 + 镜头词汇表
- `server/src/services/analysis.service.js`：案例库注入改意图摘要 + 方法论加第8条

## 当前服务/基线
- 后端 :3000、前端 :5173 运行中
- 待提交：CLAUDE.md + analysis.service.js 改动

## 待办
- 五年级(1).mp4 提示词：视频在公司，等回公司跑分析再磨
- 提示词评审继续：下次可以拿新视频跑，按"情境→反应→镜头"框架出初版，用户叙述对比

## 新增：DECISIONS.md 方案台账（防讨论阶段中断丢思路）
- 痛点：讨论阶段中断时，接力日志只能记"在讨论X"，接不回已定决策/未决岔路
- 方案：新建 DECISIONS.md（按需求的活台账：方案/决策/待定/状态，就地维护随讨论更新）
  - 三文件分工：conversation-log=流水账 / TODO=任务 / DECISIONS=活台账
  - 维护规则写进 CLAUDE.md（一出方向就更新；启动清单第3步加读 DECISIONS.md）
  - _reference/ 已 gitignore（放用户调度系统等参考资料）
- 已种入当前讨论：题材化提示词学习系统 + 借鉴调度系统 两条 🟡讨论中

## 当前讨论中（详见 DECISIONS.md）
- 题材化提示词学习系统：粒度=题材指纹(+关系+开场类型)、diff两层append-only全记录、三层架构(捕获/活规则/毕业固化)、用户判定毕业、可插拔模块
- 待用户放调度系统到 _reference/scheduler/ 供借鉴

## 题材学习系统 第①层地基（实验档案）已建成
采纳 Codex 建议顺序：先建实验档案+fingerprint v2，skill插拔等看完调度系统(已审,记在DECISIONS)再定。
- db: experiments 表(append-only) + tasks.topic_fingerprint 列
- experiment.model.js: create/listByReport/listByFingerprint/occurrences(DISTINCT report去重)/markSatisfied
- extractTopicFingerprint 6维(+关系+开场类型)，run() 写入；导出复用
- 抓取点: ①生成→system_gen ②评审→user_review ③采用→markSatisfied
- 实测全通过；五年级(1)指纹=indoor_dual_fatherdaughter_book_fixed_direct-talk
- 剩: ④对比反馈→diff_b、提示词编辑→diff_a、第②层活规则注入、第③层毕业固化
- 详见 DECISIONS.md

## Codex 评审 d9f87ec → 修复4处（RAG前必修，已完成）
- P1 采用破坏append-only+把负面评审翻satisfied → 改append kind='adopt'新行，不动旧行
- P1 采用版没进档案 → adopt行记 systemPrompt(默认)+userRewrite(实际采用)+strategy+satisfied
- P2 voiceover-entry误判called-turn → extractOpening重排，入画类优先
- P2 occurrences按report_id灌水 → 改按video_name去重（source_video_hash留后续）
- experiments加strategy列；experiment.model删markSatisfied(违append-only)
- 实测：负面review不被污染✓、采用版进档案✓、开场重排✓、去重✓
