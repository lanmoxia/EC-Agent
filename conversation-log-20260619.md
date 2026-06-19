# 会话记录 2026-06-19

> 续 6-17。本日主线：理清这几天的混乱 → 确定 RAG 第②层方案 → 建成「活状态锚点系统」。

## 开局：理清混乱（用户感觉乱，要求通读 log/记忆/todo）
- 通读 6-15/16/17 log + DECISIONS + TODO + prompt-experiments + 4个未提交改动
- 画出脉络：6-15/16 环境+准确性校验+可灵+豆包多账户 → 6-17 提示词评审(人味写法) + 引入Codex + 题材学习系统第①层地基 + Codex评审修4处 → 6-18 做diff_b抓取但没提交、窗口因API中断 → 接力乱
- 诊断根因：主线A(日常打磨:上传→出词→评审)被主线B(题材学习系统基础设施)缠住，本想快速打磨却扎进了基建

## diff_b 收尾提交（commit 8c375bd）
- 6-18 那4个未提交文件(.gitignore/DECISIONS/prompt-experiments/analysis.service.js)核对完整：import齐、语法过、model字段全支持——就差一个commit
- 提交封口：题材学习系统第①层「compare_feedback」抓取点落地，至此 system_gen/user_review/adopt/compare_feedback 四类抓取点全就位

## RAG 第②层方案拍板（详见 DECISIONS.md）
- 澄清认知：现有"历史参考注入"(analysis.service.js:276)是**空壳**——注入的"核心经验"是写死的固定字符串，没从真实diff学东西
- **决策1 推进顺序＝先攒数据再建**：库里仅2条system_gen、0条adopt/review/compare。RAG无数据=空转。先回归打磨主线攒真实样本，某题材攒够3-5条再建第②层
- **决策2 技术路线＝轻量规则注入**（不上向量库）：6维指纹结构化匹配 + 一次LLM蒸馏同题材历史diff → 注入，替换空壳。向量embedding留作数据上百条后的升级
- 现状：🟡 方案已拍板，等真实样本启动；用户只管正常打磨，第①层自动攒燃料

## 活状态锚点系统（本日重头戏，已建成+验证+上线）

### 背景：旧"每句lanmoxia"不可靠
- 用户发现我一路在漏 lanmoxia（认账：大部分回复没在第一行甚至没有）
- 用户点破缺陷：规则埋CLAUDE.md里、文件变大被压下去、长会话注意力衰减就漏；锚点本该报警却在最该生效时失效
- 更深：静态口令证明不了"真在跟踪上下文"（跑偏也能机械吐出），是假安心
- 用户查证"之前改的方案"：实查发现唯一变化是规则被镜像进AGENTS.md(给Codex)，**从无自动化机制**

### 查实Claude Code钩子能力（派claude-code-guide子代理+并行WebSearch，三源互证）
- **没有任何钩子能改写/前插我的输出文字**——100%保证"每句带锚点"在Claude Code里物理上不可能
- 能做到的上限：output style(系统提示词层预防) + UserPromptSubmit(每轮提醒) + **Stop钩子(读输出→不合格decision:block逼重答，确定性兜底，带stop_hook_active防循环/8次封顶)**

### 用户定的最终方案（取代每句lanmoxia）
- 锚点格式：`ANCHOR: lanmoxia | current_task=… | changed=… | next=…`（活状态，非死口令）
- 预防＝output style `Anchor`；兜底＝Stop钩子校验；审计＝violations.log；MessageDisplay只做显示不作可信依据
- 用户追加4条硬要求：①摘最近user请求一起校验(防漂亮废话) ②空话拦截不承诺100%(规则拦明显糊弄) ③写时序读不到先sleep重读 ④验收留证据(输入/输出/是否拦截/log)

### 落地文件
- 新增：`.claude/output-styles/anchor.md`、`.claude/hooks/anchor-check.js`(node校验器)、`.claude/hooks/anchor-check.sh`(双机定位node)
- 改：`.claude/settings.json`(Stop钩子+outputStyle:Anchor)、`CLAUDE.md`/`AGENTS.md`(规则换新)、`.gitignore`(+violations.log)、`DECISIONS.md`(方案归档)
- memory：`feedback-lanmoxia-anchor.md` 更新为新方案 + MEMORY.md 指针

### 环境命门（已查实）
- 无jq；node不在默认PATH(在 `/c/nvm4w/nodejs/node.exe`)→钩子用node绝对路径，wrapper做双机回退
- transcript结构：`{type, message.content[]}`，assistant文本块`{type:text}`、`{type:tool_use,name}`；node.exe要喂Windows路径

### 验收证据
- 4例自测：合格放行 / 空话拦截(current_task_filler等) / 无锚点拦截 / 与请求不相关拦截——全如预期；violations.log正确记录
- **上线后真实竞态暴露写时序bug**：Stop钩子第一下就误拦我（我回复首行明明是ANCHOR）。查transcript实证：钩子触发时我的回复还没落盘，往回扫读到上一轮旧回复→误判
- 修复：读到的回复首行非ANCHOR也sleep900ms重读一次（旧版只兜"完全读不到"）。竞态模拟测试(sleep间追加锚点)证明守卫生效；A1合格放行/A2无锚点拦 无回归
- 关键：钩子每次重新执行磁盘脚本，修复**对下一次校验立即生效**，无需重启

### 生效说明 & 残留缺口
- Stop钩子已实测活了(它抓了我)；output style是否激活待重启确认(我一直手动输ANCHOR)
- 残留：没机制能强改输出，Stop是事后"检测+逼重答"，补丁追加非干净前置；极端仍可能漏第一下，但一定记进violations.log

## 待办
- 提示词打磨主线：回归"上传视频→出词→评审"，让第①层自动攒题材样本（某题材3-5条后启动第②层RAG）
- 五年级(1).mp4 提示词仍待磨（旧待办）
- 第②层RAG：等真实样本；source_video_hash硬化、diff_a文本计算（可选）
- SessionStart钩子可加"题材数据进度监控"(每窗口自动数各题材样本数，达标喊话)——上次提过，未做
