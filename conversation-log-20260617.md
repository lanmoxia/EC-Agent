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

## Codex 监督机制（本轮新增，待 Codex 确认后推送）
- 新建 CODEX-REVIEW-GUIDE.md：Codex 评审章程（只看不改/增量评审不通读/架构地图/高发bug类型/输出格式）
- 机制：用户不定时让 Codex 按章程评审增量改动 → Codex 报 file:line+严重度+建议 → Claude 逐条核实再修
- 给用户的短指令已提供（粘给 Codex 用）
- .codex/ 和 AGENTS.md 是 Codex 配置，是否提交共享待用户定

## 待办
- AGENTS.md/.codex 是否提交（家里也用 Codex 则提交共享，否则 gitignore）
- 磨提示词正题：五年级(1).mp4 第一版提示词待出（报告已读，开场已纠正：特效不复刻→女儿画外音→爸爸抬头→女儿快步入画→对话）

## 当前服务/基线
- 后端 :3000、前端 :5173 运行中（会话内，注入 PATH 含 /c/ffmpeg/bin）
- 最新提交 4fc6e56；CODEX-REVIEW-GUIDE.md + 本接力 待推送（等 Codex 确认指令）
