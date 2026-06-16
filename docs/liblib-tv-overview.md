# LibTV 平台知识库

> 来源：LibTV使用指南.pdf（935页，图片扫描件，文本层为骨架提炼）
> 整理日期：2026-06-16

官网：https://www.liblib.tv
CLI：https://www.liblib.tv/cli

---

## 一、平台定性

LibTV 是 LiblibAI 推出的 AI 创作平台，核心是 **Canvas 画布工作台** + **多模型集成** + **Agent/Skill 自动化工作流**。
不是单一生成工具，而是聚合平台——一个界面内可调用下方所有模型。

---

## 二、模型清单（按类型）

### 2.1 生图模型
| 模型 | 特点 |
|---|---|
| LibNavo Pro | 综合最强，TOP 1 PPT/海报，支持 1:4/4:1/1:8/8:1 极端比例 |
| LibNavo 2 | Pro 的轻量版 |
| Seedream 5.0 Lite | 2K/4K，商业图 |
| Seedream 4.5 | PPT/图文混排 |
| Seedream 4.0 | Logo/IP/电商 |
| Midjourney V7 | 艺术风，支持 --serf |
| Midjourney Niji 7 | 动漫/插画 |
| Z-Image Turbo | 快速出图 |
| Qwen Image | 图文混排/Logo |
| Qwen Image Edit | 局部编辑 |

### 2.2 生视频模型（重点）
| 模型 | 时长 | 备注 |
|---|---|---|
| **Kling O3** | 2-3s / 3-60s | 最新旗舰，质量最高 |
| **Kling O1** | 2-3s / 3-60s | 7档质量控制 |
| **Kling 3.0** | - | 支持 BGM，运镜控制 |
| Kling 2.6 | - | - |
| Kling 2.5 / 2.1 | - | - |
| Shot V2 / Shot V2 Pro | 720p, 12s | - |
| **Seedance 2.0** | 3-15s | 720p/1080p，即梦最新 |
| Seedance 2.0 VIP / Fast VIP | - | VIP 专属加速 |
| Seedance 1.5 Pro / 1.0 Pro / 1.0 Lite | - | 旧版 |
| Video 3.1 / 3.1 Fast / 3 / 3 Fast | - | - |
| Wan 2.6 / 2.5 / 2.2 | - | - |
| Hailuo 2.3 / 2.3 Fast / 02 | - | - |
| Vidu Q3 Pro / Q2 Pro / Q2 Turbo | - | - |
| Pixverse V5.5 / V5 | 1-16s | - |
| OmniHuman 1.5 | - | 人物专项 |
| MJ Video | - | Midjourney 视频 |

### 2.3 视频理解模型
| 模型 | 能力 |
|---|---|
| CVLM 5.5 | 视频理解/镜头分析/描述 |
| GVLM 3.1 / 3.1 Flash Pro | 视频理解 |
| Qwen3 VL Flash | OCR + 2D/3D 理解，20+ 语言 |

### 2.4 语音模型
| 模型 | 特点 |
|---|---|
| Minimax Speech 2.8 / hd / turbo | 300+ 音色，TTS |
| Eleven V3 | - |
| Mureka V8 | - |

---

## 三、Agent / Skill 系统

- 平台内置 **Agent** 机制，可安装官方或第三方 Skill
- 已知内置 Skill：**solo filming**（单人短视频拍摄工作流）
- Agent 可串联：分析 → 生图 → 生视频，流程自动化
- **CLI 接入**：`https://www.liblib.tv/cli`，支持命令行调用

---

## 四、Canvas 工作台核心功能

- **Slash 命令**（/xxx）快速调用工具
- **360° 旋转**（Lib Navo 专属，720° 扩展视野）
- **素材库**（269+ 预设风格）
- **3D 资产编辑**（V/R/S/X 快捷键变换，FOV 调整）
- **时间轴编辑**：2/4/6 帧，30/60/90fps，Slow Motion
- **音轨**：BGM + 配音合并，20分钟上限
- **批量生成**：最多 25 次，-3 到 +5 风格偏移

---

## 五、对我们项目的价值判断

### 5.1 直接可用
| 场景 | 如何用 |
|---|---|
| 一个平台出豆包+可灵 | LibTV 同时集成 Seedance 2.0（=豆包底层）和 Kling O3，用户可在一个入口操作 |
| 视频理解辅助 | CVLM5.5/GVLM3.1 可做二次视频分析（备用，我们主要用 Qwen omni） |
| 生图需求 | LibNavo Pro / Seedream 5.0 覆盖角色图/场景图/道具书图生成 |

### 5.2 Agent 接入可行性（待研究）
- CLI 接口存在 → 理论上可从我们的 analysis.service 直接 POST 到 LibTV CLI
- solo filming Skill → 可能直接接收我们的分析报告/提示词
- **需要的信息**：LibTV CLI API 文档（PDF 里是截图，未能提取具体 endpoint 和鉴权方式）

### 5.3 提示词适配要点
- Seedance 2.0 在 LibTV 里：支持 @角色图引用（`@1` 格式），与我们可灵 @引用逻辑类似
- Kling O3 在 LibTV 里：prompt 字段，5-30s 时长，支持参考图
- 两个平台都支持 **"以上一镜最后帧为起始"** 的拼接逻辑

---

## 六、待补充（PDF 图片层未能提取的内容）

- [ ] LibTV CLI 具体 API endpoint 和鉴权方式
- [ ] Agent Skill 安装/调用接口
- [ ] solo filming Skill 的输入格式
- [ ] Seedance 2.0 在 LibTV 里的完整参数（参考图数量上限、prompt 字段格式）
- [ ] Kling O3 具体参数（负向 prompt、运镜控制参数名）

**获取方法**：直接访问 https://www.liblib.tv/cli 或在平台内点 CLI 文档链接，比 PDF 更准确。
