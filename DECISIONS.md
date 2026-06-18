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

**下一步（第①层补全 + 第②③层）**：
- [ ] 抓取点④对比+反馈→compare_feedback行(diff_b+user_judgment)
- [ ] diff_a 计算：提示词编辑(PUT)时记 user_rewrite + 系统vs重写的diff
- [ ] 第②层：listByFingerprint 提炼活规则 → 注入提示词生成(替代/增强现 RAG)
- [ ] 第③层：evolution 扫描按 occurrences 提议毕业(用户确认) → 固化题材模块

**现状**：🟢 第①层地基已建成跑通；剩 diff 计算 + 第②③层待续。

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
