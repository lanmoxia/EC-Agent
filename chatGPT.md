你今天要先搞清楚一件事：**Agent 不是“更聪明的聊天机器人”，也不是“把提示词写复杂”。Agent 的本质是：让模型在一个受控系统里，自己判断下一步，调用工具，读取状态，处理结果，再继续行动，直到完成任务。**

## 1. Agent 的最准确定义

可以这样理解：

> **Agent = 大模型 + 目标 + 工具 + 状态/记忆 + 执行循环 + 安全边界。**

OpenAI 的 Agents SDK 把 agent 定义为：一个配置了 instructions、tools，并可选包含 handoffs、guardrails、structured outputs 的 LLM。OpenAI API 文档也强调，agents 是会计划、调用工具、跨 specialist 协作，并保留足够状态来完成多步骤工作的应用。([OpenAI GitHub][1])

你不要被“智能体”这个词骗了。真正重要的不是名字，而是这几个能力：

| 模块                | 作用       | 例子                    |
| ----------------- | -------- | --------------------- |
| LLM               | 判断、推理、生成 | GPT / Claude / Gemini |
| Tools             | 执行动作     | 查数据库、调用接口、搜索、发邮件、生成图片 |
| State             | 保存过程状态   | 用户资料、订单状态、对话历史、任务进度   |
| Planner           | 决定下一步    | 先查资料，再分析，再写结果         |
| Guardrails        | 限制行为     | 不允许越权查数据，不允许乱下单       |
| Human-in-the-loop | 人类确认     | 付款、发送、删除、改数据库前确认      |

最底层的 Agent loop 通常是：

```text
用户提出目标
↓
模型判断需要什么信息/动作
↓
调用工具
↓
工具返回结果
↓
模型根据结果继续判断
↓
可能继续调用工具
↓
输出最终结果或执行动作
```

OpenAI 的 function/tool calling 文档也描述了类似流程：应用把可用工具发给模型，模型返回结构化工具调用，应用侧执行代码，再把工具结果交回模型，模型继续生成最终回答或继续调用工具。([OpenAI开发者][2])

---

## 2. Workflow 和 Agent 的区别

这是你必须分清的核心点。

Anthropic 在《Building Effective AI Agents》里把两者区分得很清楚：**workflow 是预先写死路径的系统；agent 是让模型动态决定流程和工具使用方式的系统。**([Anthropic][3])

### Workflow

路径固定，人提前设计好：

```text
用户上传视频
→ 提取画面
→ 调用分析模型
→ 生成报告
→ 生成豆包提示词
→ 输出结果
```

这更像你现在的“Qwen 分析 → GPT 校正 → 豆包/可灵生成”流程。

### Agent

路径不完全固定，模型自己决定下一步：

```text
用户说：帮我复刻这个视频
→ Agent 判断：需要先看视频
→ 调用视频分析工具
→ 判断：还缺书本参考图
→ 询问或调用素材库
→ 判断：豆包更适合一镜到底，可灵适合复杂动作
→ 输出两版提示词
→ 检查是否含污染词
→ 自我修正
```

这里不是你把每一步写死，而是 Agent 根据任务状态自己选择动作。

**残酷点说：你现在很多工作不是缺 Agent，而是缺稳定 Workflow。**
你做教辅短视频复刻，最先应该工程化的是固定流程，而不是一上来追求“全自动智能体”。因为你的任务高度重复，规则明确，先做 Workflow 成本更低、稳定性更高。等 Workflow 跑顺了，再把局部升级成 Agent。

---

## 3. 什么任务适合 Agent，什么不适合

Agent 适合：

1. 任务步骤不固定；
2. 需要多次查资料、多次调用工具；
3. 中间结果会影响下一步；
4. 用户目标清楚，但路径不清楚；
5. 需要长期状态和上下文。

例如：

```text
帮我分析这个岗位，我现在 Vue 基础，学过 uniapp 云开发，判断我能不能做，并给我补课路线。
```

这适合 Agent，因为它需要读取岗位、分析技能差距、规划学习、可能查文档、拆项目。

不适合 Agent 的任务：

```text
把这段话改得更口语化。
生成一个豆包10秒提示词。
把这张图中的书换成参考图。
```

这些更适合普通单次模型调用或固定 Workflow。

**你最容易犯的错是：把所有自动化都叫 Agent。**
真正的 Agent 有自主决策链路；没有自主决策，只是接口串联，那叫 Workflow、Pipeline、RPA 或自动化脚本。

---

## 4. Agent 的技术组成

### 4.1 模型层

模型负责判断：

```text
我现在知道什么？
我缺什么？
我要不要调用工具？
调用哪个工具？
工具结果可靠吗？
下一步是什么？
```

模型不是直接操作系统。它只能输出“意图”或“工具调用请求”。真正执行的是你的程序。

### 4.2 工具层 Tools

工具是 Agent 的手脚。

常见工具：

```text
search_web(query)
read_file(file_id)
query_database(sql)
create_order(data)
send_email(to, body)
generate_image(prompt)
analyze_video(file)
```

OpenAI 工具文档说明，构建 agents 时可以用内置工具、function calling、tool search、remote MCP servers 扩展模型能力。([OpenAI开发者][4]) Claude 的工具文档也说明，Claude 会根据用户请求和工具描述决定是否调用工具，工具可以由应用侧执行，也可以由服务端执行。([Claude平台][5])

关键问题是：**工具描述要写得非常清楚。**
Agent 失败很多时候不是模型不行，而是工具定义烂。

差的工具：

```text
process(data)
```

好的工具：

```text
query_user_order_status(user_id, order_id)
用于查询某个用户的订单状态。只读，不会修改订单。
```

### 4.3 状态层 State

Agent 必须知道当前任务进展。

例如一个短视频复刻 Agent 的状态：

```json
{
  "target_video_analyzed": true,
  "scene_type": "户外小区双人对话",
  "platform": "豆包",
  "duration_limit": "10s",
  "book_reference_ready": true,
  "needs_voice_sync": true,
  "avoid_subtitles": true,
  "current_step": "generate_prompt"
}
```

没有状态，Agent 每一步都像失忆，输出就会飘。

### 4.4 记忆 Memory

Memory 分两种：

| 类型   | 用途             |
| ---- | -------------- |
| 短期记忆 | 当前任务上下文        |
| 长期记忆 | 用户偏好、历史项目、固定规则 |

你这种业务尤其需要长期记忆，比如：

```text
豆包提示词要白话，不要专业词。
禁止字幕。
9:16。
画面要明亮鲜艳，不能灰。
书本只换贴图，不重生一本新书。
```

但记忆不能乱塞。长期记忆越脏，Agent 越容易污染输出。

### 4.5 RAG / 知识库

RAG 是让 Agent 去查你的知识库，而不是只靠模型记忆。

你的场景可以建这些知识库：

```text
爆款视频分析报告库
豆包成功提示词库
可灵成功提示词库
书本封面素材库
角色形象模板库
失败案例库
平台限制规则库
```

然后 Agent 每次生成前先检索类似案例。

这比你每次从零写提示词强太多。

### 4.6 Guardrails 安全边界

Guardrails 是防止 Agent 乱来。

OpenAI Agents SDK 明确把 guardrails 作为可选运行时能力之一，OpenAI 也有专门的 guardrails 文档。([OpenAI GitHub][1])

你的业务里 guardrails 可以是：

```text
不得生成字幕。
不得改变书本角度。
不得让未说话角色开口。
不得自动添加金色特效。
不得生成不相关年级。
不得把三本参考书理解成只展示三本。
```

如果你做小程序业务系统，guardrails 更重要：

```text
不能越权查用户数据。
不能直接修改订单。
不能自动退款。
不能泄露其他用户信息。
不能执行危险 SQL。
所有写操作必须二次确认。
```

---

## 5. MCP 是什么，为什么你会反复听到它

MCP，全称 Model Context Protocol，是一种让 AI 应用连接外部系统的开放标准。Anthropic 官方介绍说，MCP 让开发者可以在数据源和 AI 工具之间建立安全的双向连接；官方 MCP 文档也把它解释为让 AI 应用连接数据源、工具和工作流的开放标准。([Anthropic][6])

你可以粗略理解为：

```text
以前：每个 Agent 都要单独接 Notion、GitHub、数据库、浏览器、文件系统
现在：这些能力可以做成 MCP Server，Agent 作为 MCP Client 去调用
```

对你来说，MCP 不是第一优先级。
你应该先掌握：

```text
普通 API 工具调用
→ 数据库查询
→ 文件读取
→ RAG
→ Agent loop
→ 再学 MCP
```

直接跳 MCP，会变成“概念懂很多，项目做不出来”。

---

## 6. 主流 Agent 框架怎么选

现在常见方向有这些：

| 方向                    | 适合谁                    | 你现在是否该重点学    |
| --------------------- | ---------------------- | ------------ |
| OpenAI Agents SDK     | 想快速用 OpenAI 做 agent    | 可以学          |
| LangChain / LangGraph | 想做复杂流程、状态图、多工具编排       | 可以学，但别一开始陷进去 |
| Google ADK            | Google 生态、多语言、企业 agent | 了解即可         |
| Claude tool use / MCP | Claude 生态、工具连接         | 了解即可         |
| 自己写 Agent loop        | 想真正理解底层                | 必须学          |

OpenAI Agents SDK 官方文档强调，Agents SDK 适合应用自己掌控 orchestration、tool execution、approvals 和 state 的场景。([OpenAI开发者][7]) LangChain 文档说明，agents 建在 LangGraph 之上，以支持 durable execution、streaming、human-in-the-loop、persistence 等能力。([LangChain 参考文档][8]) Google ADK 官方介绍则把它定位为开源 Agent 开发框架，用于构建、调试、部署可靠的 AI agents，并支持多语言。([Agent Development Kit][9])

我的判断很直接：

**你现在不要先沉迷框架。先自己手写一个最小 Agent loop。**
否则你会变成“会调 LangChain，但不知道 Agent 为什么失败”。

---

## 7. 最小 Agent 伪代码

你先理解这个就够了：

```js
const tools = {
  searchKnowledgeBase,
  analyzeVideo,
  generateDoubaoPrompt,
  checkPromptPollution
}

async function runAgent(userTask) {
  let state = {
    task: userTask,
    steps: [],
    final: null
  }

  while (!state.final) {
    const decision = await callLLM({
      task: state.task,
      state,
      tools: Object.keys(tools)
    })

    if (decision.type === "tool_call") {
      const result = await tools[decision.tool](decision.args)
      state.steps.push({
        tool: decision.tool,
        args: decision.args,
        result
      })
    }

    if (decision.type === "final_answer") {
      state.final = decision.content
    }
  }

  return state.final
}
```

这就是 Agent 的骨架。
框架只是把这套东西包装得更完整。

---

## 8. 放到你的业务里，Agent 可以怎么用

你做教辅短视频复刻，最有价值的不是“聊天 Agent”，而是这几个业务 Agent。

### 8.1 爆款视频分析 Agent

输入：

```text
原视频
台词
目标平台：豆包 / 可灵
目标产品：暑假预习四年级
```

输出：

```text
画面事实说明
镜头结构
人物关系
动作链
台词时点
复刻难点
平台适配建议
```

### 8.2 提示词生成 Agent

输入：

```text
Qwen 分析报告
素材情况
平台限制
用户历史偏好
```

输出：

```text
豆包白话版提示词
可灵精确版提示词
污染词检查
失败风险提示
```

### 8.3 失败案例诊断 Agent

输入：

```text
生成失败的视频/图片
原提示词
目标效果
```

输出：

```text
失败原因：
1. 角色动作冲突
2. 书本参考污染
3. 台词太长
4. 镜头描述不清
5. 豆包算力无法承载
```

然后给修正版。

### 8.4 素材管理 Agent

输入：

```text
我要做暑假预习五年级，户外双人对话
```

Agent 自动找：

```text
五年级书封
对应角色图
干净场景图
历史成功提示词
相似爆款案例
```

### 8.5 小程序 AI 服务层 Agent

如果你后面做岗位里那种“AI 服务层集成到小程序”，架构大概是：

```text
uniapp / Vue 小程序前端
↓
Node / Python 后端 API
↓
Agent Orchestrator
↓
工具层：
- 用户数据库
- 订单数据库
- 内容生成服务
- 向量知识库
- 文件存储
- 审核规则
↓
日志 / 权限 / 监控 / 成本统计
```

你不要幻想“用 Codex/Claude Code 就能自动完成”。
能不能完成，关键不是 Agent，而是你是否能把业务拆成明确接口、明确数据结构、明确权限边界。

---

## 9. 你真正该学的顺序

不要按网上那种“LangChain 全家桶”学。那会浪费时间。

### 第一阶段：底层概念

必须搞懂：

```text
LLM
Prompt
Token
Function calling
Tool calling
JSON schema
RAG
Embedding
Vector database
Agent loop
State
Memory
Guardrails
Human-in-the-loop
```

### 第二阶段：自己写最小 Demo

做一个简单 Agent：

```text
用户输入：帮我根据产品名生成短视频脚本
Agent：
1. 查产品资料
2. 查历史爆款模板
3. 生成脚本
4. 检查是否违反平台规则
5. 输出最终版本
```

先不要用 LangChain。
用普通 Node.js 或 Python 写。

### 第三阶段：接数据库

你必须会：

```text
用户表
任务表
素材表
生成记录表
提示词版本表
失败原因表
```

Agent 没有数据库，就是玩具。

### 第四阶段：加 RAG

把你的成功提示词、失败案例、爆款分析报告放进知识库。

Agent 每次生成前先检索类似案例。

### 第五阶段：加审核和权限

尤其是涉及用户数据、订单、付费、内容发布时：

```text
只读工具可以自动执行
写入工具必须确认
高风险动作必须人工审核
```

### 第六阶段：再学框架

这时再看：

```text
OpenAI Agents SDK
LangGraph
LangChain middleware
MCP
Google ADK
Claude tool use
```

LangChain middleware 文档提到，middleware 可以在 agent 执行过程中插入逻辑，用于状态处理、响应验证、工具错误处理、动态模型选择、日志和监控等。([LangChain 文档][10]) 这些东西只有在你已经知道自己要控制什么时才有价值。

---

## 10. 你今天应该重点理解的 6 个问题

### 问题 1：Agent 到底比普通 API 多了什么？

普通 API：

```text
输入 → 模型 → 输出
```

Agent：

```text
输入 → 模型判断 → 调工具 → 读结果 → 再判断 → 再调工具 → 输出/执行
```

差别是：**Agent 有循环，有工具，有状态，有决策。**

---

### 问题 2：Agent 会不会自动变聪明？

不会。

Agent 只会把模型能力放进一个循环系统里。
如果工具设计差、状态混乱、权限不清、知识库垃圾，Agent 只会更快地制造垃圾。

---

### 问题 3：多 Agent 是不是更高级？

不一定。

很多所谓多 Agent 系统只是：

```text
一个 Agent 说废话
另一个 Agent 评价废话
第三个 Agent 总结废话
```

多 Agent 只有在角色边界清晰时才有意义。

例如你的业务可以这样拆：

```text
视频分析 Agent
提示词生成 Agent
污染检查 Agent
平台适配 Agent
失败诊断 Agent
```

这有意义。

但如果只是：

```text
导演 Agent
编剧 Agent
审核 Agent
优化 Agent
```

职责模糊，就会互相污染。

---

### 问题 4：Agent 最大风险是什么？

不是“不会用工具”。
最大风险是：

```text
看起来在工作，其实在瞎编。
```

尤其是：

```text
假装查过数据库
假装理解视频
假装执行成功
假装知道用户意图
假装调用了工具
```

所以每个关键动作必须有日志、有结果、有校验。

---

### 问题 5：Agent 和 RAG 是什么关系？

RAG 是 Agent 的信息来源之一。

```text
RAG 负责查资料
Agent 负责决定什么时候查、查什么、查完怎么用
```

你的视频复刻业务里，RAG 非常关键。因为你的经验、失败案例、平台限制都应该沉淀下来，而不是靠你每次口头重新说。

---

### 问题 6：Agent 和小程序结合的核心难点是什么？

不是前端。
不是 Vue。
不是页面。

核心难点是后端：

```text
用户身份
权限控制
数据库结构
任务状态
工具调用
日志追踪
成本控制
失败重试
内容审核
异步任务队列
```

如果你只会前端，靠 Codex/Claude Code 能不能做？
能做 Demo，能做原型，能做简单业务。
但要上线稳定跑，你必须补后端工程能力。否则 Agent 一旦接真实用户数据，你会被权限、异常、成本、并发、日志、审核拖死。

---

## 11. 给你的学习路线，别绕远路

### 第 1 天：概念打底

只学：

```text
Agent loop
Tool calling
State
Memory
RAG
Guardrails
Human confirmation
```

不要看一堆框架课。

### 第 2 天：写一个无框架 Agent

用 Node.js 或 Python 写：

```text
用户输入任务
模型判断是否调用工具
工具返回结果
模型继续回答
```

### 第 3 天：接一个真实工具

比如：

```text
读取本地 JSON 文件
查询 SQLite / Supabase
调用一个素材搜索接口
```

### 第 4 天：做你的业务 Demo

项目名可以叫：

```text
短视频复刻提示词 Agent
```

功能：

```text
输入：视频分析报告 + 产品年级 + 平台
输出：豆包提示词 / 可灵提示词 / 风险检查
```

### 第 5 天：加知识库

放入：

```text
成功提示词
失败提示词
用户固定偏好
平台限制
角色模板
书本尺寸规则
```

### 第 6 天：加评估

每次输出后自动检查：

```text
有没有字幕污染？
有没有台词归属错误？
有没有镜头缺失？
有没有书本朝向错误？
有没有平台时长超限？
```

### 第 7 天：再考虑框架

这时你再看 OpenAI Agents SDK 或 LangGraph。
否则你看框架只是堆概念，实际不会用。

---

## 12. 你当前最该警惕的误区

你现在最大的问题不是“不懂 Agent”。
而是你容易把 Agent 当成“救命工具”。

现实是：

```text
Agent 不能替你定义业务流程。
Agent 不能替你判断什么是好素材。
Agent 不能替你建立失败案例库。
Agent 不能替你设计数据库。
Agent 不能替你承担上线风险。
```

Agent 只能放大你已有的流程能力。
你的流程清楚，它就自动化。
你的流程混乱，它就自动混乱。

所以你真正该做的是：

```text
先把你的视频复刻流程标准化
再把标准化流程工具化
再把工具接到 Agent
最后才谈自动化生产
```

这条路才有结果。

[1]: https://openai.github.io/openai-agents-python/agents/?utm_source=chatgpt.com "OpenAI Agents SDK"
[2]: https://developers.openai.com/api/docs/guides/function-calling?utm_source=chatgpt.com "Function calling | OpenAI API"
[3]: https://www.anthropic.com/research/building-effective-agents?utm_source=chatgpt.com "Building Effective AI Agents"
[4]: https://developers.openai.com/api/docs/guides/tools?utm_source=chatgpt.com "Using tools | OpenAI API"
[5]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview?utm_source=chatgpt.com "Tool use with Claude - Claude API Docs"
[6]: https://www.anthropic.com/news/model-context-protocol?utm_source=chatgpt.com "Introducing the Model Context Protocol"
[7]: https://developers.openai.com/api/docs/guides/agents?utm_source=chatgpt.com "Agents SDK | OpenAI API"
[8]: https://reference.langchain.com/python/langchain?utm_source=chatgpt.com "LangChain Reference Docs"
[9]: https://adk.dev/?utm_source=chatgpt.com "Agent Development Kit (ADK) - Agent Development Kit (ADK)"
[10]: https://docs.langchain.com/oss/javascript/langchain/agents?utm_source=chatgpt.com "Agents - Docs by LangChain"

可以。那今天只聊 **Agent 本身**，不碰小程序。

你现在应该把 Agent 分成三层理解：

## 1. 概念层：Agent 到底是什么

Agent 不是某个软件，也不是某个框架。

它是一个工作方式：

```text
给 AI 一个目标
让 AI 自己判断下一步
必要时调用工具
拿到结果后继续判断
直到完成任务
```

最简单公式：

```text
Agent = 大模型 + 工具 + 状态 + 循环判断
```

普通聊天是：

```text
你问一句 → AI答一句
```

Agent 是：

```text
你给目标 → AI拆任务 → 调工具 → 看结果 → 再拆 → 再调 → 最后给结果
```

区别就在于：**Agent 不是只回答，它会“执行过程”。**

---

## 2. 实战层：你真正要学哪些东西

暂时不要看太多“多 Agent”“智能体框架”“MCP 全家桶”。那很容易虚胖。

你今天优先学这 7 个东西：

### 第一，Tool Calling

也就是让 AI 调用工具。

比如你给它这些工具：

```text
读取文件
搜索资料
分析图片
生成提示词
检查提示词问题
保存结果
```

然后它自己判断什么时候用哪个工具。

这就是 Agent 的手脚。

---

### 第二，State 状态

Agent 必须知道当前进度。

例如你做视频复刻：

```json
{
  "平台": "豆包",
  "时长": "10秒",
  "是否一镜到底": true,
  "是否有书本参考图": true,
  "当前步骤": "生成提示词",
  "已完成": ["分析视频", "提取台词", "判断难点"]
}
```

没有状态，Agent 每一步都会像失忆。

---

### 第三，Memory 记忆

记忆不是聊天记录那么简单。

它是长期规则库，比如：

```text
豆包提示词必须白话
不要专业镜头术语
禁止字幕
书本不要重生，只换贴图
角色要夏季服装
画面不能灰
台词要明确谁说
```

你这类业务非常依赖 Memory。否则每次都要重新教 AI。

---

### 第四，RAG 知识库

RAG 就是让 Agent 去查你自己的资料。

你最应该沉淀的是：

```text
成功提示词库
失败提示词库
爆款视频分析报告
不同平台生成规律
书本尺寸规则
角色模板
场景模板
常见错误修正方案
```

这比空谈 Agent 有用得多。

一个强 Agent，不是因为它“会想”，而是因为它能查到你过去真正有效的经验。

---

### 第五，Planner 规划器

Planner 负责拆步骤。

比如你说：

```text
帮我复刻这个教辅视频
```

Agent 应该自动拆成：

```text
1. 判断视频类型
2. 提取镜头结构
3. 提取人物动作
4. 判断豆包/可灵适配方式
5. 生成提示词
6. 检查污染词
7. 输出最终版本
```

你现在很多时候是在人工做 Planner。

以后你可以让 Agent 做一部分。

---

### 第六，Evaluator 评估器

这是很多人忽略的部分。

Agent 生成完不能直接用，要自检：

```text
有没有字幕？
有没有台词归属错误？
有没有动作冲突？
有没有时长超载？
有没有镜头描述缺失？
有没有让角色乱说话？
有没有污染平台生成？
```

没有 Evaluator 的 Agent，很容易一本正经地产垃圾。

---

### 第七，Guardrails 边界

Guardrails 是硬规则。

例如：

```text
不能生成字幕
不能改书本角度
不能让未说话角色开口
不能把参考图里的文字照搬成字幕
不能自动添加直播间贴纸
不能把三本参考书理解成只展示三本
```

你这种 AI 视频复刻场景，Guardrails 极其重要。
否则 Agent 会“自作聪明”。

---

## 3. 你最适合从哪种 Agent 入手

别一上来做通用 Agent。那是浪费时间。

你最适合做的是：

## 视频复刻提示词 Agent

输入：

```text
原视频分析报告
台词
平台：豆包 / 可灵
产品：暑假预习三年级 / 四年级 / 五年级 / 六年级
素材情况：有无角色图、场景图、书本图
```

输出：

```text
1. 画面事实整理
2. 复刻难点
3. 豆包提示词
4. 可灵提示词
5. 风险检查
6. 修正版提示词
```

这个方向最贴近你的业务，不虚。

---

## 4. 一个最小 Agent 流程

你可以先不写代码，先设计流程：

```text
用户输入任务
↓
Agent 判断任务类型
↓
如果是视频复刻：
    读取视频分析报告
    提取镜头、人物、动作、台词
    判断平台限制
    查询历史成功案例
    生成提示词
    自检提示词
    输出最终版本
```

注意，这里核心不是“AI 一次生成提示词”。

而是：

```text
先理解
再匹配案例
再生成
再检查
再修正
```

这才是 Agent 思路。

---

## 5. 你现在不要碰的东西

暂时别重点学这些：

```text
多 Agent 协作
MCP Server
LangChain 复杂链
AutoGPT 类项目
Agent swarm
浏览器自动操作 Agent
```

原因很简单：这些东西看起来高级，但容易让你脱离实际业务。

你现在最该做的是：

```text
单 Agent
少工具
强规则
强状态
强自检
```

先把一个 Agent 做稳，比看十个框架强。

---

## 6. 你可以按这个顺序学

### 第一步：理解 Tool Calling

目标：知道 AI 怎么调用外部工具。

你要弄懂：

```text
工具名称
工具描述
输入参数
输出结果
模型如何决定调用
调用结果如何返回给模型
```

---

### 第二步：理解 Agent Loop

目标：知道 Agent 为什么可以多步工作。

流程：

```text
模型判断 → 调工具 → 读结果 → 再判断 → 再调工具 → 输出
```

---

### 第三步：设计你自己的工具

先从文本工具开始，不用复杂。

例如：

```text
analyze_prompt_problem
检查提示词问题

rewrite_for_doubao
改写成豆包白话版

check_video_prompt_risk
检查视频生成风险

match_success_case
匹配历史成功案例
```

---

### 第四步：设计状态表

例如：

```json
{
  "task_type": "视频复刻",
  "platform": "豆包",
  "duration": "10秒",
  "has_scene_image": true,
  "has_book_image": true,
  "has_character_image": false,
  "script_ready": true,
  "main_risk": ["台词太长", "动作过多", "参考图污染"]
}
```

---

### 第五步：加知识库

把你以前的成功案例整理成结构化内容：

```text
案例名称
平台
场景类型
角色数量
视频时长
原始提示词
成功点
失败点
修正方式
最终可用版本
```

这一步比你继续随手问 AI 更重要。

---

## 7. 一个你能直接用的 Agent 模板

你可以这样设计你的第一个 Agent：

### 名称

```text
教辅视频复刻提示词 Agent
```

### 输入

```text
1. 视频分析报告
2. 原台词
3. 目标产品
4. 目标平台
5. 素材情况
```

### 处理流程

```text
1. 判断视频类型
2. 提取镜头结构
3. 提取角色关系
4. 提取动作链
5. 判断平台限制
6. 检索类似成功案例
7. 生成初版提示词
8. 检查污染项
9. 改成平台适配版
10. 输出最终提示词
```

### 输出格式

```text
一、复刻核心
二、难点判断
三、豆包版提示词
四、可灵版提示词
五、风险提醒
六、建议先测哪个版本
```

这个就够你练很久。

---

## 8. 你真正该建立的思维

别把 Agent 当成“万能员工”。

应该把 Agent 当成：

```text
一个会调用工具的流程执行器
```

它强不强，取决于你给它的：

```text
流程是否清楚
工具是否明确
案例库是否干净
规则是否足够硬
检查机制是否可靠
```

你当前最需要的不是“学很多 Agent 名词”。

你最需要的是把你的经验从脑子里拿出来，变成：

```text
规则
模板
案例
检查项
流程图
数据结构
```

这些东西一旦整理好，Agent 才能真正帮你。否则它只是另一个会乱说的聊天窗口。


你的判断是对的：**这堆东西确实庞大，但不是因为它们都重要，而是因为你把“不同层级的东西”放在一起学了。**

你现在必须先停下来，不要继续横向看资料。否则你会进入一种假学习状态：每天都在看新名词，但没有一条主线能落地。

## 先把这些名词归类

你看到的东西，其实分成 6 类：

| 名词                    | 本质               | 你现在该不该重点学     |
| --------------------- | ---------------- | ------------- |
| Prompt                | 指挥模型怎么回答         | 必学            |
| RAG                   | 让模型查你的资料再回答      | 必学，但先学简单版     |
| Tool Calling          | 让模型调用工具          | 必学            |
| Agent                 | 模型自己判断下一步并调用工具   | 必学，但先做单 Agent |
| LangChain / LangGraph | Agent / RAG 工程框架 | 后学            |
| MCP                   | 连接外部工具和数据的协议     | 后学            |
| Skill                 | 可复用任务能力包/流程包     | 后学，先理解概念      |
| 微调                    | 用数据训练模型行为        | 暂时别碰          |

你现在真正需要的是这条线：

```text
Prompt → RAG → Tool Calling → Workflow → Agent → 框架 / MCP / 微调
```

不要反过来学。

---

## 一、LangChain 不等于 Agent

LangChain 是框架，不是基础知识。

LangChain 官方现在把自己定位成构建、测试、部署 AI agents 的工程平台；LangGraph 则更偏底层编排，强调 durable execution、streaming、human-in-the-loop 等能力。官方文档也明确说，刚开始做 agent 可以用 LangChain 的高层 agents，LangGraph 更适合需要底层编排能力时再用。([LangChain][1])

翻译成人话：

```text
LangChain = 工具箱
LangGraph = 更复杂的流程控制器
Agent = 你要实现的工作方式
```

你现在的问题不是“不会 LangChain”，而是还没把 Agent 的基础工作流想清楚。

所以，**先不要学 LangChain 全家桶。**

你只需要知道它以后可能帮你做：

```text
模型调用
工具调用
RAG 检索
多步骤流程
状态管理
日志观察
```

但第一阶段你完全可以不用它。

---

## 二、MCP 也不是第一优先级

MCP 是 Model Context Protocol。官方定义是：一种让 AI 应用连接外部系统的开放标准，可以连接数据源、工具和工作流，比如本地文件、数据库、搜索引擎、计算器、专用提示词等。官方还把它类比成 AI 应用的 USB-C 接口。([Model Context Protocol][2])

MCP 的价值是标准化连接方式。

但你现在不需要先研究 MCP Server、MCP Client、Resources、Prompts、Tools 这些细节。

你先理解一句话就够：

```text
MCP = 让 AI 更方便地接外部工具和数据的协议。
```

你现在应该先会普通 Tool Calling。
等你真的有一堆工具要接，再学 MCP。

---

## 三、RAG 才是你近期最值得学的

你写成了“rga”，大概率是 RAG。

RAG 的核心是：**不要让模型凭空记忆，而是让它先检索你的资料，再基于资料回答。** Microsoft Azure 文档把 RAG 描述为一种用你的数据来 grounding prompts 的生成式 AI 模式；AWS 也把 RAG 解释为让大模型在生成前引用训练数据之外的权威知识库。([Microsoft Learn][3])

你的业务最该用 RAG 的地方不是“大知识库”，而是小而准的案例库。

你不要建这种东西：

```text
AI知识库
Agent知识库
提示词知识库
视频知识库
行业知识库
```

这太大，必死。

你应该建这种：

```text
豆包成功提示词库
豆包失败案例库
可灵成功提示词库
书本贴图规则库
角色形象模板库
画面复刻错误清单
Qwen视频分析报告库
```

重点不是“资料越多越好”，而是：

```text
每条资料都能直接提高下一次生成成功率。
```

这才叫有用的 RAG。

---

## 四、Skill 不是你现在的主线

Skill 这个词很容易误导你。

它通常指：

```text
一个可复用的任务能力包
```

比如：

```text
视频分析 Skill
豆包提示词生成 Skill
图片贴图描述 Skill
失败诊断 Skill
角色提示词 Skill
```

它本质上可能包含：

```text
固定流程
提示词模板
工具调用
检查规则
示例案例
```

所以 Skill 不是和 RAG、Agent、MCP 同级的东西。

更准确的层级是：

```text
Agent 可以调用 Skill
Skill 内部可能使用 RAG
Skill 可能通过 MCP 连接工具
Skill 也可能只是一个提示词模板
```

你现在不用专门学 Skill。
你先把自己的工作流整理成可复用模板，未来自然就是 Skill。

---

## 五、微调现在基本不该碰

微调不是新手救命药。

OpenAI 的微调文档明确强调：先建立 evals，判断基础模型是否真的不够，再准备训练数据、上传训练集、创建 fine-tuning job，并评估结果。OpenAI 的模型优化文档也把优化路径放在“evals → prompt engineering → 必要时 fine-tuning”的循环里，而不是一上来就微调。([OpenAI开发者][4])

你现在碰微调，大概率是浪费时间。

因为你的问题主要不是模型不会，而是：

```text
任务流程没标准化
成功案例没结构化
失败原因没归档
提示词版本没管理
平台差异没沉淀
检查规则没固化
```

微调解决不了这些。

微调适合什么？

```text
固定格式输出
固定风格输出
分类任务
大量重复任务
基础模型反复犯同类错误
你已经有高质量训练数据
你已经有评估集
```

你现在更应该做的是：

```text
案例库 + RAG + 自检规则
```

不是微调。

---

## 六、你真正该学的只有 5 块

把所有噪音删掉，你只学这 5 个。

### 1. Prompt 基础

目标：让模型稳定输出。

你要掌握：

```text
角色设定
任务目标
输入信息
输出格式
限制条件
示例
检查项
```

你的视频提示词业务，这块已经在练了。

---

### 2. 结构化输出

目标：让模型别乱写。

比如让它输出：

```json
{
  "scene_type": "户外双人对话",
  "camera": "手持轻微晃动",
  "duration": "10秒",
  "characters": [],
  "dialogue": [],
  "risks": [],
  "final_prompt": ""
}
```

这比让模型自由发挥可靠。

---

### 3. RAG

目标：让模型查你自己的成功经验。

先不用搞复杂向量库。
你可以先从最土的方法开始：

```text
Excel / Notion / JSON / Markdown 案例库
按场景类型、平台、年级、失败原因分类
每次生成前人工或半自动检索相似案例
```

等数据多了，再上向量数据库。

---

### 4. Tool Calling

目标：让模型调用工具。

比如：

```text
查案例
检查提示词
替换年级
生成豆包版
生成可灵版
输出风险清单
```

Tool Calling 是 Agent 的地基。

---

### 5. Agent Loop

目标：让模型多步执行。

最小循环：

```text
判断任务
↓
查资料
↓
生成
↓
检查
↓
修正
↓
输出
```

这就是你最该掌握的 Agent。

---

## 七、你接下来 30 天不要学什么

直接砍掉：

```text
LangChain 深入源码
LangGraph 复杂状态图
MCP Server 开发
多 Agent 协作
AutoGPT 类项目
模型微调
大规模向量数据库
企业级 Agent 架构
浏览器自动操作 Agent
```

这些不是没用，是**现在对你没用**。

你现在看这些，只会制造焦虑和幻觉进度。

---

## 八、你该建的不是“大知识库”，而是“小案例库”

你说知识库太庞大，这个判断对，但解决方式不是“不建知识库”。

是把知识库降级成案例库。

先建 6 张表就够：

### 1. 成功提示词表

```text
平台
场景类型
时长
角色数量
是否一镜到底
原提示词
成功点
可复用句式
```

### 2. 失败案例表

```text
平台
失败现象
原提示词
失败原因
修正方案
最终版本
```

### 3. 场景类型表

```text
户外双人对话
直播间推荐
仓库打包
传送带展示
家庭亲子
车内对话
```

### 4. 角色模板表

```text
妈妈
爸爸
女儿
儿子
教辅老师
仓储主管
直播间推荐员
```

### 5. 书本规则表

```text
封面朝向
塑封状态
尺寸比例
厚度限制
书脊方向
贴图规则
```

### 6. 平台规则表

```text
豆包：白话、10秒、少动作、台词要短
可灵：可用参考图、可做复杂动作、适合延续上一帧
```

这就够了。
别一上来搞“AI知识库体系”。

---

## 九、你的学习路线应该变成这样

### 第 1 阶段：只学概念，不学框架

时间：3 天。

目标：

```text
知道 Prompt、RAG、Tool Calling、Agent、MCP、微调分别是什么
知道它们之间的层级关系
知道自己现在该学什么、不该学什么
```

结果标准：

```text
你能用自己的话解释：
RAG 是查资料
Tool Calling 是调用工具
Agent 是循环决策
MCP 是连接协议
LangChain 是框架
微调是训练模型行为
```

---

### 第 2 阶段：整理你的案例库

时间：7 天。

不要写代码。

只做一件事：

```text
把你过去成功/失败的提示词整理成表格
```

字段就用：

```text
平台
场景
目标
原提示词
结果
失败点
修正点
最终可用版本
```

这是你最有价值的资产。

---

### 第 3 阶段：做一个“人工 RAG”

时间：3 天。

不用向量数据库。

你每次生成提示词前，先人工查表：

```text
这个任务像哪个成功案例？
这个失败风险像哪个失败案例？
这类场景豆包容易错什么？
```

然后再让 AI 生成。

你会立刻发现成功率提高。

---

### 第 4 阶段：设计检查器

时间：5 天。

做一个固定检查清单：

```text
是否有字幕？
是否超过平台时长？
是否台词太密？
是否动作过多？
是否说话人不清？
是否书本朝向不清？
是否参考图污染？
是否镜头运动缺失？
```

这就是 Evaluator 的雏形。

---

### 第 5 阶段：再学 Tool Calling

时间：7 天。

把这些检查项变成工具：

```text
check_prompt_risk()
rewrite_for_doubao()
rewrite_for_kling()
match_success_case()
extract_scene_type()
```

---

### 第 6 阶段：最后再学 Agent

时间：7 天。

把流程串起来：

```text
输入任务
→ 判断场景
→ 查案例
→ 生成提示词
→ 检查风险
→ 修正
→ 输出
```

这才是你的第一个 Agent。

---

## 十、你现在最该接受的事实

你不是被知识库难住了。

你是被**没有主线的学习方式**拖住了。

真正的顺序是：

```text
先把自己的业务流程拆清楚
再把经验整理成案例
再用 RAG 查案例
再用工具调用处理固定步骤
最后才做 Agent
```

不要再横向看名词了。
你现在只需要围绕一个目标：

```text
如何让 AI 更稳定地帮我生成教辅短视频复刻提示词？
```

凡是不能直接服务这个目标的内容，30 天内全部跳过。

[1]: https://www.langchain.com/?utm_source=chatgpt.com "LangChain: Observe, Evaluate, and Deploy Reliable AI Agents"
[2]: https://modelcontextprotocol.io/docs/getting-started/intro?utm_source=chatgpt.com "Model Context Protocol"
[3]: https://learn.microsoft.com/en-us/azure/search/retrieval-augmented-generation-overview?utm_source=chatgpt.com "Retrieval Augmented Generation (RAG) in Azure AI Search"
[4]: https://developers.openai.com/api/docs/guides/supervised-fine-tuning?utm_source=chatgpt.com "Supervised fine-tuning | OpenAI API"


你要学的不是“Agent 全套知识”，而是围绕你这个项目，学一条很明确的链路：

> **视频理解 → 结构化分析 → 提示词生成 → 生成结果评估 → 反馈优化 → 案例沉淀 → 半自动工作流**

这才是你的主线。LangChain、MCP、RAG、微调、Skill 都只是这条链路里的工具，不是学习目标。

---

# 一、先说结论：你需要学 8 块

按优先级排：

```text
1. 多模态视频分析
2. 结构化输出
3. 提示词工程
4. 案例库 / RAG
5. 生成结果评估
6. Agent / Workflow 编排
7. 基础后端与文件处理
8. 数据指标与内容运营判断
```

你暂时不用重点学：

```text
模型微调
多 Agent 协作
复杂 LangChain
复杂 MCP Server
企业级知识库
AutoGPT 类项目
```

这些会让你绕远路。

---

# 二、你的项目应该拆成 5 个模块

你想做的东西可以拆成这样：

```text
用户上传原视频
↓
AI 分析原视频
↓
生成豆包 / 可灵提示词
↓
用户拿提示词去生成视频
↓
用户上传生成结果
↓
AI 对比原视频和生成视频
↓
结合用户主观反馈
↓
输出优化后的提示词
↓
沉淀成功 / 失败案例
```

这不是一个“纯 Agent 项目”。
它本质是一个 **AI 工作流系统**，其中局部可以用 Agent。

这句话很关键：**先做 Workflow，再做 Agent。**

---

# 三、模块 1：视频分析，你要学什么

你的视频复刻业务，第一核心不是 Agent，而是 **视频理解能力**。

你需要让 AI 从视频里提取这些东西：

```text
1. 视频时长
2. 画幅比例
3. 镜头数量
4. 是否一镜到底
5. 运镜方式
6. 场景环境
7. 人物数量
8. 人物位置
9. 动作链
10. 台词归属
11. 口型时点
12. 道具书出现时间
13. 构图和景别
14. 光线和色彩
15. 是否有字幕/贴纸/特效污染
```

你要学的技术不是“怎么训练视频模型”，而是：

```text
ffmpeg 抽帧
关键帧提取
视频转图片序列
多模态模型读图
让模型按固定 JSON 输出分析报告
```

你真正要掌握的是：**怎么把视频变成 AI 能稳定分析的材料。**

最小实现可以这样：

```text
上传视频
↓
每 1 秒抽 1 帧
↓
再抽开头、中间、结尾关键帧
↓
把帧图交给多模态模型分析
↓
输出结构化报告
```

不要一开始就追求“AI 完整理解 10 秒视频”。
先做抽帧分析，够用了。

---

# 四、模块 2：结构化输出，你必须重点学

这是你项目成败的关键。

你不能让 AI 随便写一篇分析报告。必须让它输出固定结构。

比如：

```json
{
  "video_basic_info": {
    "duration": "10s",
    "aspect_ratio": "9:16",
    "shot_count": 1,
    "camera_style": "固定手机镜头，轻微晃动"
  },
  "scene": {
    "location": "小区一楼大厅",
    "lighting": "白天自然光，画面明亮",
    "background_elements": ["纸箱", "快递袋", "墙面", "地面"]
  },
  "characters": [
    {
      "role": "女性",
      "age": "30多岁",
      "position": "画面左侧偏下",
      "clothing": "紫色短袖上衣，白色裤子",
      "actions": ["蹲下拆快递", "抬头回答", "拿书站起"]
    }
  ],
  "dialogue": [
    {
      "speaker": "画外女声",
      "text": "你也买了载望的暑假预习四年级啊？",
      "time": "0.5s-2.5s"
    }
  ],
  "replication_difficulty": [
    "开头动作和台词要同步",
    "书本出现时间要准确",
    "不能生成字幕"
  ]
}
```

你要学：

```text
JSON Schema
结构化 Prompt
字段约束
固定输出格式
自动检查字段缺失
```

这比学 LangChain 重要 10 倍。

---

# 五、模块 3：提示词工程，你已经在做，但需要系统化

你现在的问题是：经验有，但散。

你要把提示词能力拆成几个固定模板：

```text
1. 豆包 10 秒一镜到底模板
2. 可灵 15 秒多图参考模板
3. 图生视频模板
4. 视频续写模板
5. 书本贴图模板
6. 角色提取模板
7. 失败修正模板
8. 对比复刻模板
```

你要学的不是“高级 Prompt 技巧”，而是：

```text
如何把提示词组件化
如何减少污染词
如何控制台词归属
如何控制动作数量
如何控制镜头运动
如何控制书本朝向
如何控制平台适配
```

例如你的豆包模板应该固定成这样：

```text
基础约束
+ 场景描述
+ 角色描述
+ 镜头描述
+ 动作链
+ 台词
+ 书本出现方式
+ 禁止项
+ 画面风格
```

可灵模板又是另一套：

```text
首帧参考
+ 角色参考
+ 场景参考
+ 道具参考
+ 镜头延续
+ 动作变化
+ 台词同步
+ 结尾状态
```

你现在别追求“一个万能提示词”。
那是错的。应该按平台分模板。

---

# 六、模块 4：案例库 / RAG，你必须做，但不要做大知识库

你说知识库庞大，这个判断对。
所以你不要做“AI 大知识库”，你要做 **案例库**。

你的案例库字段应该是这样：

```text
案例编号
平台：豆包 / 可灵 / 即梦 / 其他
任务类型：视频复刻 / 图片贴图 / 角色生成 / 传送带展示
场景类型：户外双人 / 仓库打包 / 工厂传送带 / 直播间 / 家庭亲子
原始需求
原提示词
生成结果
失败问题
修改方式
最终可用提示词
可复用经验
标签
```

这就是你的 RAG 数据。

RAG 在你项目里的作用是：

```text
用户上传一个新视频
↓
系统判断它属于“户外双人对话”
↓
从案例库里找类似成功案例
↓
参考成功案例生成新提示词
↓
避免重复踩坑
```

你要学：

```text
Embedding 是什么
向量检索是什么
相似案例检索
标签检索
混合检索：关键词 + 向量
```

但第一阶段不用上复杂向量数据库。

第一阶段你可以用：

```text
Excel / Notion / 飞书表格 / JSON 文件
```

先人工整理 50 条案例，比你直接学向量库更有价值。

---

# 七、模块 5：生成结果评估，这是你项目的核心壁垒

你真正想做的是：

```text
原视频
vs
生成视频
↓
AI 判断哪里不像
↓
结合你的主观反馈
↓
重新优化提示词
```

这个能力非常值钱。

评估要分两层。

## 1. AI 客观评估

AI 要检查：

```text
构图是否接近
人物站位是否接近
镜头远近是否接近
运镜是否一致
角色动作是否完整
台词是否缺失
口型是否对上
书本是否出现
书本角度是否正确
字幕是否误生成
画面是否灰
是否多了无关道具
是否改了场景
```

你可以让 AI 输出这种结构：

```json
{
  "match_score": {
    "scene": 80,
    "camera": 65,
    "character_position": 70,
    "action": 60,
    "book_display": 45,
    "dialogue_sync": 75,
    "overall": 66
  },
  "main_problems": [
    "书本出现太晚",
    "角色没有从蹲姿站起来",
    "镜头缺少轻微前推",
    "画面偏灰"
  ],
  "prompt_revision_suggestions": [
    "把书本出现时间提前到第3秒",
    "明确写出女性从蹲姿慢慢站起",
    "增加开头轻微前推",
    "加入画面明亮、色彩干净鲜亮"
  ]
}
```

## 2. 用户主观反馈

用户补充：

```text
书太小
角色不像
动作慢了
镜头没有推
台词乱说
画面灰
```

系统要把主观反馈翻译成提示词修改指令。

例如：

```text
用户反馈：书太小
↓
系统改写为：
角色手中的书本尺寸加大，长度约等于2个iPhone13，宽度约等于1.5个iPhone13，厚度不超过一个iPhone13，画面中书本占手部面积更明显。
```

这才是你的项目真正有价值的地方。

---

# 八、模块 6：Workflow / Agent，你要学到什么程度

你现在不用学复杂多 Agent。
你只需要学一个简单的工作流：

```text
分析 Agent
↓
提示词生成 Agent
↓
评估 Agent
↓
修正 Agent
```

但早期不要真的拆成 4 个 Agent。
先拆成 4 个固定步骤。

## 第一版不要做 Agent，做 Workflow

```text
Step 1：上传原视频，生成分析报告
Step 2：选择平台，生成提示词
Step 3：上传生成视频，生成对比报告
Step 4：输入主观反馈，生成修正版提示词
```

## 第二版再做半 Agent

让 AI 自动判断：

```text
这是豆包任务还是可灵任务？
这是户外双人还是仓库传送带？
需要参考哪个案例？
应该调用哪个模板？
生成结果的问题属于哪一类？
```

你要学：

```text
任务分类
状态管理
工具调用
多步骤执行
失败重试
人工确认
```

LangChain、LangGraph 可以后面再用。
第一版用普通代码写流程就够。

---

# 九、模块 7：后端和文件处理，绕不过去

你虽然说不聊小程序，但你这个项目只要想做成产品，就绕不开基础后端。

你至少要学：

```text
文件上传
视频存储
任务状态
数据库
接口调用
异步任务
日志记录
用户历史记录
```

最小技术栈可以是：

```text
前端：Vue / uniapp
后端：Node.js / Python
数据库：SQLite / PostgreSQL / Supabase
文件存储：本地 / OSS / S3
视频处理：ffmpeg
AI 模型：GPT / Claude / Gemini / Qwen / 豆包
```

你不需要成为高级后端，但你必须懂这些概念。
否则你只能停留在“会问 AI”，做不成系统。

---

# 十、模块 8：电商内容运营判断

截图这个岗位不是纯技术岗。它叫：

```text
电商 AI 场景设计师
```

它真正要的是：

```text
AI 工具落地
电商内容生产
素材提效
投放转化
直播话术
详情页图文
团队 SOP
合规审核
```

这不是单纯 Agent 岗。
它更像：

```text
AIGC 运营负责人 + 内容生产流程设计 + 工具选型 + 提效落地
```

你的视频复刻经验是有价值的，因为你已经在做：

```text
爆款拆解
素材复刻
提示词优化
失败反馈
平台适配
内容批量化
```

但你的短板也明显：

```text
1. 电商数据指标理解不够系统
2. 投放逻辑不够完整
3. SOP 沉淀还不够产品化
4. AI 工具链还偏个人手工操作
5. 合规、版权、素材风控需要补
6. 还没有形成可展示的项目案例
```

你如果想靠近这种岗位，不是去学一堆 Agent 名词，而是做一个能展示的项目：

```text
AI 短视频复刻与优化系统
```

这个项目比你简历上写“熟悉 LangChain、MCP、RAG”更有说服力。

---

# 十一、你现在最该做的项目版本

不要做大而全。

先做 MVP：

## 项目名

```text
教辅短视频复刻提示词优化器
```

## 第一版功能

```text
1. 上传原视频
2. AI 输出视频分析报告
3. 选择平台：豆包 / 可灵
4. 输入产品：暑假预习三年级等
5. 生成提示词
6. 用户上传生成结果
7. AI 输出复刻差异分析
8. 用户输入主观反馈
9. AI 生成优化提示词
10. 保存案例
```

## 第一版不用做的功能

```text
不用自动调用视频生成平台
不用做复杂多用户系统
不用做模型微调
不用做 MCP
不用做复杂权限
不用做复杂知识库
不用做自动剪辑
```

先把核心闭环跑通。

---

# 十二、你要学的知识路线，按顺序来

## 第 1 阶段：AI 视频分析基础

学：

```text
ffmpeg 抽帧
关键帧选择
图片批量传给多模态模型
视频分析报告结构化
```

产出：

```text
上传一个视频 → 输出稳定的视频复刻分析 JSON
```

---

## 第 2 阶段：提示词模板系统

学：

```text
模板变量
平台模板
场景模板
角色模板
书本规则模板
输出格式控制
```

产出：

```text
同一个视频分析报告 → 能生成豆包版 / 可灵版提示词
```

---

## 第 3 阶段：案例库

学：

```text
案例字段设计
标签体系
成功失败归因
简单检索
人工 RAG
```

产出：

```text
至少整理 50 条你自己的成功/失败案例
```

这一步最苦，但最值钱。

---

## 第 4 阶段：对比评估

学：

```text
原视频抽帧
生成视频抽帧
关键帧对比
多模态模型打分
问题分类
提示词修正建议
```

产出：

```text
上传原视频 + 生成视频 → 输出差异报告
```

---

## 第 5 阶段：反馈优化

学：

```text
用户反馈分类
反馈转提示词约束
自动修正提示词
版本管理
```

产出：

```text
用户说“书太小、画面灰、动作慢”
↓
系统自动生成修正版提示词
```

---

## 第 6 阶段：Workflow 编排

学：

```text
任务状态
多步骤流程
错误处理
日志
版本记录
```

产出：

```text
一个完整流程：
原视频 → 分析 → 提示词 → 生成结果分析 → 修正提示词 → 保存案例
```

---

## 第 7 阶段：再学 RAG / Agent / LangChain

这时候再学：

```text
向量数据库
Embedding
RAG 检索
Agent Tool Calling
LangGraph
MCP
```

因为这时你已经知道自己为什么要用它们了。

---

# 十三、每个名词在你项目里的真实位置

你现在可以这样理解：

| 名词        | 在你项目里的作用       | 现在优先级 |
| --------- | -------------- | ----- |
| Prompt    | 生成豆包/可灵提示词     | 最高    |
| 结构化输出     | 让视频分析稳定        | 最高    |
| RAG       | 查相似成功/失败案例     | 高     |
| Agent     | 自动决定下一步怎么修     | 中高    |
| Workflow  | 串起完整流程         | 最高    |
| LangChain | 帮你实现 Agent/RAG | 中     |
| LangGraph | 做复杂状态流程        | 后期    |
| MCP       | 接外部工具标准协议      | 后期    |
| Skill     | 把某类任务封装成能力     | 后期    |
| 微调        | 训练固定风格/格式      | 暂时不碰  |
| 向量数据库     | 相似案例检索         | 中后期   |
| ffmpeg    | 视频抽帧和处理        | 很高    |
| 数据库       | 保存案例和任务        | 很高    |

---

# 十四、你最现实的 30 天计划

## 第 1 周：整理案例库

别写代码。

只整理：

```text
20 条成功提示词
20 条失败提示词
10 条典型修正案例
```

字段固定：

```text
平台
场景类型
原任务
原提示词
生成结果
失败点
修正方式
最终提示词
可复用规则
```

这是地基。

---

## 第 2 周：做视频分析模板

目标：

```text
任何一个10秒视频
都能输出固定格式分析报告
```

你可以先不用系统，直接在 ChatGPT / Qwen 里验证模板。

---

## 第 3 周：做提示词生成器

目标：

```text
输入视频分析报告 + 平台 + 产品
输出豆包/可灵提示词
```

先做手动版。

---

## 第 4 周：做对比评估模板

目标：

```text
输入原视频分析报告 + 生成视频分析报告 + 用户反馈
输出：
1. 问题归因
2. 修改策略
3. 新提示词
```

这 4 周做完，你已经比大多数只会说 Agent 的人更接近实战。

---

# 十五、你真正的学习边界

现在只学这些：

```text
Prompt
结构化输出
ffmpeg 抽帧
多模态分析
案例库
简单 RAG
Workflow
基础 Tool Calling
```

暂时不学：

```text
微调
复杂 MCP
复杂 LangChain
多 Agent
大模型训练
企业知识库架构
自动浏览器操作
```

你的方向不是“成为 AI 架构师”。
你的方向应该是：

```text
成为能把 AIGC 落到电商内容生产流程里的场景设计师
```

这和截图岗位高度相关。

你现在真正要交付的不是“我懂 Agent”，而是：

```text
我能把一个爆款视频拆解成可复用流程；
我能把流程变成提示词模板；
我能把失败结果变成优化规则；
我能把经验沉淀成案例库；
我能让团队批量生产更稳定的视频素材。
```

这才是岗位会买单的能力。
