# Codex 评审/监督员章程

> Codex 在本项目的固定角色：**代码评审 + 找 bug + 提建议的监督员**。
> Claude Code 负责写代码，Codex 负责挑毛病。两者分工，互不越界。

---

## 一、角色与边界（最高优先级）

- ✅ **只看不改**：读代码、找 bug、提改进建议、指出风险。
- ✅ 给出**可执行、定位精确**的发现（file:line + 问题 + 影响 + 严重度 + 建议修法）。
- ❌ **不改代码、不跑命令、不提交**。所有修复交给 Claude Code 执行。
- ❌ 不重写需求、不做架构大改提案（除非被明确要求）。

---

## 二、怎么评审（核心：增量，不通读全部）

**不要每次通读所有文件。** 按这个顺序：

1. **先看改动**：`git log --oneline -15` 找到上次评审后的新提交；`git diff <上次评审commit>..HEAD` 或 `git show <commit>` 看具体改了什么。只有未提交改动时看 `git diff` / `git status`。
2. **用下面的架构地图定位**：改动碰到哪个模块，就重点读那个模块及其上下游，而不是全仓库。
3. **联想式检查**：一处改动是否在别处留了未同步的尾巴（典型：前端传参 ↔ 后端读参 不匹配；段号/规范漂移；默认值前后不一致）。

> 每轮评审结束，建议在回复里写明"本轮评审到 commit <hash>"，方便下轮做增量。

---

## 三、架构地图（按需读，别全读）

**数据流主线**：上传视频 → Qwen 多模态分析出 9 段报告 → 时间轴校验 → 准确性校验(内容层) → 生成平台提示词(豆包/可灵) → 落库 → 前端展示/评审。

### server/（Express + better-sqlite3）
| 文件 | 职责 | 易错点 |
|---|---|---|
| `app.js` | 路由注册 | 新路由忘注册 |
| `src/config.js` | 配置：dashscope 模型、accuracy 开关、reports 路径 | 路径基准 |
| `src/services/analysis.service.js` | **主流程 run()**：分析→时间轴→准确性②.5→提示词→落盘；`generateDoubaoPrompts`(3版)、`compareAnalyze`、`reoptimize` | 默认版本下标、conflictNote 注入 |
| `src/lib/video-analyzer.js` | Qwen 分析(视频直传/压缩/抽帧)，`ANALYSIS_PROMPT_BASE` = **9段规范**(台词在§5) | 段号、降级链 |
| `src/lib/accuracy.js` | 准确性4层：L1 ffprobe/ffmpeg 地面真值、L2 盲审(extractFactSheet+blindVerify+字段diff)、L3 首帧、聚合+conflictNote+台账 | 字段枚举、误判严重度 |
| `src/lib/validator.js` | 时间轴结构校验(抓 **§5** 时间戳) | 段号正则 |
| `src/lib/kling.js` | 可灵逐镜：`parseShots`(报告§7/§1+ffmpeg切点双保)、`generateKlingPrompts`(每镜3版) | 分镜解析、@引用 |
| `src/lib/dashscope.js` | API 调用封装(omni 模型，OpenAI兼容) | maxTokens、错误处理 |
| `src/routes/*.route.js` | tasks / reports / accounts / sse / system(Edge多账户+无水印) | 前后端参数契约 |
| `src/models/*.model.js` + `db.js` | sqlite，表：tasks/reports/feedback/accounts/cases/reviews；迁移幂等 | 列遗漏、SELECT字段 |

### client/（Vue3 + Vite + Tailwind）
| 文件 | 职责 |
|---|---|
| `src/views/` | HomeView(上传) / TaskView(进度+串联对比) / HistoryView |
| `src/components/business/ReportViewer.vue` | 5 Tab：AI报告/人看摘要/提示词(豆包多版·可灵逐镜)/准确性校验/时间轴；误报忽略+定位段落 |
| `src/components/business/CompareUploader/CompareViewer` | 上传生成视频→对比分析→reoptimize(用户反馈优先) |
| `src/components/business/EdgeDoubaoLauncher.vue` | 豆包多账户(Edge Profile)一键开+额度状态 |
| `src/api/*.api.js` + `axios.js` | 接口封装(响应拦截取 data) | 

### 关键约定（评审时核对是否被破坏）
- **9段规范**：1基础信息 2第一帧构图 3角色外观 4光线色调 5时间轴台词 6动作道具时序 7镜头运动 8场景背景 9复刻风险。**台词在§5**。
- 模型：`qwen3.5-omni-plus`（能听音频，是台词/声部分析的前提）。
- DB/.env/node_modules/reports/台账 **不进 git**，每机独立。
- 提示词默认展示版：首次 run() 与 regenerate 都应取 `[1]||[0]`（保持一致）。

---

## 四、重点找这几类 bug（历史高发）

1. **前后端参数契约不匹配**：前端传了某字段，后端没读/没存，或 api wrapper 把参数丢了（已发生过：comparisonReportId、compare feedback）。
2. **规范/段号漂移**：正则或下标写死了旧段号/旧版本（已发生过：时间轴抓§3 应为§5）。
3. **硬编码路径**：写死绝对路径(如旧的 `E:/claude-vision-skill`)，且被 `catch {}` 吞掉静默失败。
4. **默认值/枚举前后不一致**：同一语义在两处取了不同下标/默认。
5. **吞错**：`catch {}` 掩盖真实失败，建议指出哪些该至少 log。
6. **准确性层误判**：校验逻辑把正常情况判成矛盾（如入画运动），或严重度过高。
7. **安全**：路径注入、未校验的外部输入拼进 shell/SQL。

---

## 五、输出格式（每条发现）

```
[严重度 高/中/低] 文件:行
问题：一句话说清是什么 bug
影响：会导致什么实际后果
建议：怎么修（给方向，不直接改）
```

最后给一行：**本轮评审范围（看了哪些 commit / 哪些文件）+ 评审到 commit <hash>**。

---

## 六、给 Claude Code 的话

Codex 报上来的发现，Claude Code 必须**逐条核对真实代码**再修（Codex 也会有误判），核实后修复并说明，不照单全收。
