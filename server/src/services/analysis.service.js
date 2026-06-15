"use strict";

const fs = require("fs");
const path = require("path");
const config = require("../config");
const TaskModel = require("../models/task.model");
const ReportModel = require("../models/report.model");
const CaseModel  = require("../models/case.model");
const { analyzeVideo } = require("../lib/video-analyzer");
const { validateTimeline } = require("../lib/validator");
const { callDashScope } = require("../lib/dashscope");

// ── 中国时间工具 ──────────────────────────────────────────────────

function getChinaDateInfo() {
  const now = new Date();
  const china = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const m = china.getUTCMonth() + 1;
  const d = china.getUTCDate();
  const date = `${china.getUTCFullYear()}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const season = m >= 3 && m <= 5 ? "春季" :
                 m >= 6 && m <= 8 ? "夏季" :
                 m >= 9 && m <= 11 ? "秋季" : "冬季";
  return { date, season };
}

// ── 参考图说明构建 ────────────────────────────────────────────────

const LABEL_ZH = {
  scene_clean:     "干净场景图（无角色）",
  book:            "道具书参考图",
  character:       "角色参考图",
  scene_with_char: "有角色的场景图",
};

function buildRefImagesNote(refImages) {
  if (!refImages || !refImages.length) return "";
  const lines = ["用户提供了以下参考图（用户会按提示词中描述的顺序上传，请在提示词中按序号引用）："];
  refImages.forEach((r, i) => {
    lines.push(`  第${i + 1}张：${LABEL_ZH[r.label] || "参考图"}`);
  });
  lines.push('引用示例："书参考用户提供的第X张图"、"角色参考第X张图"');
  return lines.join("\n");
}

function buildScriptNote(scriptMode, scriptData) {
  if (!scriptMode || !scriptData) return "";
  const lines = ["用户指定台词（优先使用，替换视频中的台词）："];
  if (scriptMode === "single") {
    if (scriptData.text) lines.push(scriptData.text);
  } else if (scriptMode === "multi") {
    (scriptData.lines || []).forEach(l => {
      if (l.text) lines.push(`${l.speaker || "人物"}说："${l.text}"`);
    });
  } else if (scriptMode === "voiceover") {
    if (scriptData.voiceover) lines.push(`画外音（先说）：${scriptData.voiceover}`);
    if (scriptData.onscreen)  lines.push(`画内（后说）：${scriptData.onscreen}`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

// ── 场景类型提取 ──────────────────────────────────────────────────

function extractSceneType(aiReport) {
  const text = aiReport || "";

  // 地点：从§1拍摄类型 + §8场景关键词判断
  let loc = "other";
  if (/户外|小区|室外|街道|马路|路边|公园|楼道外|操场|草地|广场|停车场/.test(text)) loc = "outdoor";
  else if (/室内|家里|客厅|卧室|厨房|书房|教室|办公室|房间|楼道内/.test(text)) loc = "indoor";
  else if (/仓库|工厂|车间|传送带|货架|流水线|打包/.test(text)) loc = "warehouse";

  // 人数：双人特征（家长+孩子 / 两人 / 双人）
  const hasDual = (/两人|双人|二人/.test(text))
    || (/孩子|小朋友|女儿|儿子|宝贝/.test(text) && /妈妈|爸爸|家长|大人/.test(text));
  const chars = hasDual ? "dual" : "single";

  // 道具：书是本项目核心钩子，单独一维
  const prop = /书|课本|教材|绘本|杂志/.test(text) ? "book" : "noprop";

  // 运镜：跟拍 vs 固定（影响开场构图写法）
  const motion = /跟拍|手持跟随|跟随推进|边走边|一边走|跟着走|随行/.test(text) ? "tracking" : "fixed";

  return `${loc}_${chars}_${prop}_${motion}`;
}

// ── 提示词预检 ────────────────────────────────────────────────────

function checkPrompt(promptText) {
  const issues = [];
  const text = promptText || "";

  // 1. 时长估算（提取引号内台词字数）
  const dialogues = [...text.matchAll(/[""「」"']([^""「」"']{5,})[""「」"']/g)].map(m => m[1]);
  const totalChars = dialogues.reduce((s, d) => s + d.replace(/[，。！？、…\s]/g, "").length, 0);
  if (totalChars > 0) {
    const estSec = (totalChars / 4.5).toFixed(1);
    if (parseFloat(estSec) > 10) {
      issues.push({ level: "warn", msg: `台词约 ${totalChars} 字，估算 ${estSec}s，超豆包 10s 上限` });
    } else {
      issues.push({ level: "ok", msg: `台词约 ${totalChars} 字，估算 ${estSec}s，在 10s 内` });
    }
  }

  // 2. 禁用手势写法
  if (/双手持书|双手托|单手握|手指轻点|手指指向书|拇指/.test(text)) {
    issues.push({ level: "warn", msg: `含具体手势描述（双手持书/手指等），豆包会随机处理，建议只写「手里拿着书」` });
  }

  // 3. 字幕风险
  if (totalChars > 30 && !/禁止字幕/.test(text)) {
    issues.push({ level: "warn", msg: `台词较长但未写「禁止字幕」，豆包可能自动加字幕` });
  }

  // 4. 表演词检测
  if (/微笑|自然说话|坐姿端正|从容|温柔地说|眼神/.test(text)) {
    issues.push({ level: "warn", msg: "含表演词（微笑/坐姿/语气等），会干扰生成，建议删除" });
  }

  // 5. 镜像提示
  if (/书/.test(text) && !/镜像|不要反/.test(text)) {
    issues.push({ level: "info", msg: `有书本但未写「封面不要镜像」，Seedance 有概率反转书封面` });
  }

  return issues;
}

// ── 报告解析 ──────────────────────────────────────────────────────

function extractHumanSummary(aiReport) {
  const lines = aiReport.split("\n");
  const summaryLines = [];
  let inSection = false;
  let sectionCount = 0;
  for (const line of lines) {
    if (/^##\s*[12][\.．]/.test(line)) {
      inSection = true;
      sectionCount++;
    } else if (/^##\s*[3-6][\.．]/.test(line)) {
      if (sectionCount >= 2) break;
      inSection = true;
      sectionCount++;
    }
    if (inSection && sectionCount <= 2) summaryLines.push(line);
  }
  const summary = summaryLines.join("\n").trim();
  return summary || aiReport.slice(0, 600) + "…";
}

// ── 报告落盘 ──────────────────────────────────────────────────────

function saveReportFile(videoName, reportText) {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,"0")}${String(date.getDate()).padStart(2,"0")}`;
  const baseName = path.basename(videoName, path.extname(videoName));
  const fileName = `${baseName}_${dateStr}.md`;
  const filePath = path.join(config.reports.dir, fileName);
  if (!fs.existsSync(config.reports.dir)) {
    fs.mkdirSync(config.reports.dir, { recursive: true });
  }
  fs.writeFileSync(filePath, reportText, "utf8");
  return filePath;
}

// ── 豆包提示词生成（3版并行，独立文本 AI 调用） ─────────────────

function stripTitle(text) {
  return text.trim()
    .replace(/^#{1,3}\s*[^\n]*\n+/, "")
    .replace(/^\*{1,2}[^*\n]+\*{1,2}\n+/, "")
    .trim();
}

const STRATEGIES = [
  {
    name: "动作骨架版",
    wordTarget: "约90字",
    instruction: `定位：最精简，只写复刻这条视频必须的核心动作链，一句废话不加。

按这个顺序写成一段连贯口语（这是本项目验证有效的核心链路）：
① 镜头起手：具体运镜+机位（如"画面开始镜头前推固定中景，轻微仰视视角"），台词较长时句尾加"禁止字幕"
② 角色：视觉年龄 + 一句面容气质 + 单件上衣（颜色+款式，适配当前季节）
③ 角色所在位置：一句话（如"坐在室内客厅，中景人物居中占画面大半"）
④ 道具书起始状态：手里拿着书（参考第N张图）+ 封面朝镜头 + "方向不要镜像不要反了"
⑤ 开口说话：完整台词，一字不改
⑥ 道具书状态变化：按方法论第2条，用台词触发硬切到书翻开（参考第M张图）+ 内页特征

严格遵守方法论第2、5、7条：
- 只写"手里拿着书"，不写"双手持书/手指轻点"等手势
- 参考图引用必须带括号"（参考第N张图）"
- 不写表情、语气、坐姿、微笑等表演词
不写：背景各层细节、色调、时间秒数。
若报告§1/§6显示书全程无状态变化，则省略⑥，只保留④的静态描述。`,
  },
  {
    name: "场景增强版",
    wordTarget: "约120字",
    instruction: `定位：在动作骨架版基础上，补充开场空间布局和色调，让画面更还原。

包含动作骨架版的全部六步，额外加：
- 开场空间：第一帧主要背景元素的象限位置（口语化，如"背景右后方立柜、左后绿植虚化"；户外则写路的2D方向"从左下往右上斜着延伸"，同时写上下+左右）
- 色调一句（从报告§4转写，如"画面色调温暖自然，居家氛围"）
- 画面质感（室内"像手机随手拍"，户外"手机随手拍质感"）

严格遵守方法论第7条：不要写"微笑自然说话""坐姿端正"这类表情/语气/坐姿表演词——交给豆包按台词自适应。
道具书仍按状态机写（方法论第2条，只写"手里拿着书"不写手势），这是本版重点，不能省。`,
  },
  {
    name: "完整复刻版",
    wordTarget: "约150字",
    instruction: `定位：在场景增强版基础上覆盖全部关键画面细节，并在末尾做时长预检。

包含场景增强版全部内容，额外补（只补画面客观信息，不补表演）：
- 角色更完整：体型比例、发型、配饰（从报告§3提取，仍只写单件上衣）
- 书的空间位置（如胸前），但仍不写具体持握姿势和手指动作
- 光线一句（从§4转写，如"室内顶光柔和，面部光线均匀"）

严格遵守方法论第7条：禁止写表情/语气/坐姿/微笑等表演词。
末尾另起一句做时长预检（这是唯一允许出现时长数字的地方，且只在末尾，不在正文内嵌秒数）：
按"台词字数÷4.5≈台词秒数"估算，加上动作时间，给出"预估总时长约Xs"，并注明是否在豆包10s上限内。
正文里仍然禁止出现"约0-1.2s""1.2-2.8s"这类内嵌秒数标注，切镜一律用台词触发。

道具书状态机（方法论第2条）依然是全片核心，必须完整写出闭合→硬切→翻开。`,
  },
];

async function generateDoubaoPrompts(aiReport, { refImages = [], scriptMode = null, scriptData = null, sceneType = null, platform = "douban" } = {}) {
  const { date, season } = getChinaDateInfo();
  const refNote    = buildRefImagesNote(refImages);
  const scriptNote = buildScriptNote(scriptMode, scriptData);

  // 检索历史同类成功案例
  let similarCasesNote = "";
  if (sceneType) {
    const similar = CaseModel.findSimilar(sceneType, platform, 2);
    if (similar.length > 0) {
      const lines = ["## 历史成功案例（同类场景，供参考，写法可借鉴）"];
      similar.forEach((c, i) => {
        lines.push(`\n案例${i + 1}（${c.scene_type}，${c.strategy}，来自"${c.video_name}"）：\n${c.prompt_text}`);
      });
      similarCasesNote = lines.join("\n") + "\n";
    }
  }

  const commonContext = `今日日期（中国标准时间）：${date}，当前季节：${season}

## 视频分析报告
${aiReport}

${scriptNote ? `## 台词说明（优先使用，替换视频原台词）\n${scriptNote}\n` : ""}${refNote ? `## 参考图说明\n${refNote}\n` : ""}
## ★ 提示词撰写核心方法论（所有版本必须遵守，这是写好豆包提示词的关键）

### 1. 骨架来自报告的【动作与道具时序】段，不是【第一帧构图】段
提示词要描述"视频里依次发生了什么"，而不是"第一帧画面长什么样"。
先读报告的【6. 动作与道具时序】和【5. 时间轴台词】两段，找出这条视频的**核心动作钩子**
（最能驱动观看的那个动作或状态变化），整条提示词围绕它来写。
静态构图（人物位置/占比/机位）只在开场一句带过，不是主体。
⚠ 反面教材：只写"坐在客厅、居中占大半、固定机位、端正坐姿"——这是死画面，必废。

### 2. 道具书必须写成"状态机"，不是静物
看报告动作时序里书有没有状态变化（如：闭合→翻开 / 封面朝镜头→展示内页 / 报告§1指出的硬切分镜）：
- 若有变化（种草视频的核心钩子）：
  · 起始：手里拿着书，书闭合、封面面对镜头（引用道具书封面参考图）
  · 变化：用台词触发硬切——"说完【台词前段某句】的时候硬切"，切到书翻开
  · 翻开后：引用内页参考图，描述内页特征（如"上面很多红色做的笔记/标记"）
- 若书全程闭合无变化：才按静态写（封面朝镜头，合着不翻开）。
（任何情况都不描述书封面的配色/文字/图案，外观交给参考图。）
⚠ 只写"手里拿着书"，不要写"双手持书/双手托住/单手握持"等具体持握姿势——
  豆包会根据台词和场景自己生成合理的手部动作，写死手势反而添乱。同理不写"手指轻点书页"这类细节动作。

### 3. 镜头切换用"台词触发"，不用秒数
✅ "妈妈说完『九月上初一』的时候硬切"
❌ "约1.2-2.8s 切镜" / "约0-1.2s开场定格"（豆包对秒数标注理解很差）

### 4. 镜头起手要具体
✅ "镜头前推固定中景，轻微仰视视角"
❌ "固定机位无移动"（信息量太少，等于没说）

### 5. 参考图按序号引用，且必须用括号包住
✅ "手里拿着书（参考第1张图）"、"翻开的资料书（参考第3张图）"
❌ "引用第1张图"、"参考第1张图"（不带括号，混在正文里读着像旁白）

### 6. Seedance 已知坑（这两条"禁词"是有效控制，必须显式写）
- 书封面会被镜像/反转 → 写"书的封面面对镜头，方向不要镜像不要反了"
- 模型会自动加字幕 → 台词较长时写"禁止字幕"

### 7. ★只写豆包做不到的硬骨架，能交给豆包的一律不写
必须钉死的（豆包做不到/会做错）：镜头运镜与机位、人物位置与占比、完整台词、书的状态变化与硬切、参考图引用、季节服装、Seedance两个坑。
交给豆包自己生成、绝对不要写的：具体手势、面部表情、说话语气、坐姿是否端正、微笑与否。
⚠ 尤其不要写"微笑自然说话""坐姿端正"这类表演词——台词快时（如10秒长台词）语速本就很急，"自然/从容说话"会和"快语速念完台词"自相矛盾，反而干扰生成。表情语气交给豆包按台词自适应。

## 角色年龄推断规则（必须遵守）
- 台词或字幕中出现年级时，换算视觉年龄：三年级≈8-9岁、四年级≈9-10岁、五年级≈10-11岁、六年级≈11-12岁、高一≈15-16岁
- 视频中有小学生时，妈妈/家长视觉年龄推算：孩子小学低段（1-3年级）→妈妈约30-35岁；小学高段（4-6年级）→妈妈约33-38岁
- 面容写法：贴近日常真实气质，用"面容姣好""自然亲切""气质清爽"等词，不写"漂亮/精致/模特感"，不夸张

## 台词顺序规则（必须遵守）
- 有画外音时，画外音台词必须写在画内台词前面
- 台词必须完整引用，一字不改，一句不漏

${similarCasesNote}## 通用格式规则（所有版本都要遵守）
- 叙事散文，不用【中括号】结构，不分行编号，写成一段连贯口语
- 除"封面不要镜像""禁止字幕"这两条 Seedance 有效控制外，不写其它"不要XX/禁止XX"句
- 服装必须适配${season}，原视频不符合时直接改，不说明原视频穿什么
- 服装只写单件（颜色+款式），不写叠穿
- 画面质感写法融入场景叙述（室内"像手机随手拍"，户外"手机随手拍质感"）`;

  // 按历史采用频率排序，被采用最多的策略排第一
  const stats = CaseModel.strategyStats(platform);
  const orderedStrategies = [...STRATEGIES].sort(
    (a, b) => (stats[b.name] || 0) - (stats[a.name] || 0)
  );

  const results = await Promise.all(
    orderedStrategies.map(async (s) => {
      const prompt = `你是豆包 Seedance 2.0 Fast 视频提示词专家。请根据以下视频分析报告，按照指定策略写一段生成提示词（${s.wordTarget}）。

${commonContext}

## 本版策略（${s.name}）
${s.instruction}

只输出提示词正文，不要任何标题、编号或解释。`;

      const text = await callDashScope([{ type: "text", text: prompt }], { maxTokens: 400 });
      const stripped = stripTitle(text);
      return { strategy: s.name, text: stripped, checks: checkPrompt(stripped) };
    })
  );

  return results;
}

// ── 主流程 ────────────────────────────────────────────────────────

async function run(taskId, onProgress = () => {}) {
  const task = TaskModel.findById(taskId);
  if (!task) throw new Error(`任务不存在: ${taskId}`);
  TaskModel.updateStatus(taskId, "processing");

  try {
    const refImages  = task.ref_images_json ? JSON.parse(task.ref_images_json) : [];
    const scriptMode = task.script_mode || null;
    const scriptData = task.script_json ? JSON.parse(task.script_json) : null;

    if (refImages.length) onProgress(`附加 ${refImages.length} 张参考图…`);
    if (scriptMode) {
      const modeLabel = { single: "单人", multi: "多人对话", voiceover: "有画外音" }[scriptMode] || scriptMode;
      onProgress(`使用用户提供台词（${modeLabel}）…`);
    }

    // ① Qwen 多模态感知（1-6段）
    const aiReport = await analyzeVideo(task.video_path, {
      onProgress, refImages, scriptMode, scriptData,
      platform: task.platform || "douban",
    });

    // ① 场景类型提取 + 写入 task
    const sceneType = extractSceneType(aiReport);
    TaskModel.updateSceneType(taskId, sceneType);
    onProgress(`场景类型：${sceneType}`);

    // ② 时间轴校验
    onProgress("执行时间轴校验…");
    const validation = validateTimeline(task.video_path, aiReport);
    if (!validation.pass) {
      onProgress(`⚠ 校验发现 ${validation.issues.length} 个问题：${validation.issues.join("；")}`);
    } else {
      onProgress("时间轴校验通过 ✓");
    }

    // ③ 人看版摘要
    const humanSummary = extractHumanSummary(aiReport);

    // ④ 豆包提示词（3版并行，原始任务+douban平台才生成）
    let doubaoPrompt = "";
    let doubaoPromptsJson = null;
    if (task.task_type !== "comparison" && (task.platform || "douban") === "douban") {
      onProgress("正在并行生成3版豆包提示词…");
      doubaoPromptsJson = await generateDoubaoPrompts(aiReport, {
        refImages, scriptMode, scriptData,
        sceneType, platform: task.platform || "douban",
      });
      doubaoPrompt = doubaoPromptsJson[1]?.text || doubaoPromptsJson[0]?.text || ""; // 默认展示空间构图版
      onProgress("3版豆包提示词已生成 ✓");
    }

    // ⑤ 报告落盘
    onProgress("报告落盘…");
    const reportFile = saveReportFile(task.video_name, aiReport);
    onProgress(`报告已保存: ${path.basename(reportFile)}`);

    // ⑥ 写入数据库
    const report = ReportModel.create({
      taskId,
      aiReport,
      humanSummary,
      doubaoPrompt,
      doubaoPromptsJson,
      validationJson: JSON.stringify(validation),
    });

    TaskModel.updateStatus(taskId, "done");
    onProgress("完成 ✓");
    return report;
  } catch (err) {
    TaskModel.updateStatus(taskId, "failed", err.message);
    throw err;
  }
}

// ── 对比分析（自动 diff 两份报告） ──────────────────────────────

async function compareAnalyze(reportId, { comparisonReport }) {
  const report = ReportModel.findById(reportId);
  if (!report) throw Object.assign(new Error("报告不存在"), { status: 404 });

  const prompt = `对比以下两份视频分析报告，找出生成视频与原视频之间的关键差异，每点简洁列出。
重点关注：台词准确性（是否说错/漏说）、角色服装、手部动作/持书姿势、空间构图与路的方向、色调、运镜。

原视频分析报告：
${report.ai_report}

生成视频分析报告：
${comparisonReport}

输出格式（每点一行）：
· [维度]：[原视频] → [生成视频实际情况]

只输出差异列表，不要总结或前言。`;

  const result = await callDashScope([{ type: "text", text: prompt }], { maxTokens: 600 });
  return result.trim();
}

// ── 提示词重新生成（用户主导优化） ──────────────────────────────

async function reoptimize(reportId, { failureAnalysis, userFeedback }) {
  const report = ReportModel.findById(reportId);
  if (!report) throw Object.assign(new Error("报告不存在"), { status: 404 });

  const prompt = `你是豆包 Seedance 提示词专家，请输出一份修正后的提示词（约100字，自然白话叙事，不写禁词）。

当前提示词：
${report.doubao_prompt || "（暂无当前提示词）"}

客观差异分析（系统对比两份报告得出）：
${failureAnalysis || "（无）"}

用户主观反馈（优先级最高，以此为主要修改依据）：
${userFeedback || "（无）"}

修改原则：
- 以用户反馈为核心修改点；差异分析作为辅助参考
- 保留原提示词中正确的部分，只修改有问题的描述
- 不写"不要XX""禁止XX"禁词；不写[0-1s]等时间标记
- 如涉及服装，仍按当前季节适配

只输出提示词正文，不要解释。`;

  const newPrompt = await callDashScope([{ type: "text", text: prompt }], { maxTokens: 500 });
  return ReportModel.update(reportId, { doubaoPrompt: newPrompt.trim() });
}

module.exports = { run, compareAnalyze, reoptimize, generateDoubaoPrompts };
