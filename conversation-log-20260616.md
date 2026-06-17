# 会话记录 2026-06-16

## 环境搭建（已完成）
- 新机器（用户 999888）从零搭起：nvm-windows + Node 切到 22.22.3（机器上另有 24，**勿用 24**，better-sqlite3 ABI 绑死 22）
- server/client 依赖已装，better-sqlite3 预编译加载 OK，server/.env 的 DASHSCOPE_API_KEY 已配
- setup.ps1 修了 UTF-8 BOM（PS5.1 GBK 误读崩溃）
- 前后端已在会话内后台运行：后端 :3000、前端 :5173，均验活
- 运行态 DB：`E:\EC-Agent\claude-vision.db`（全新空库）

## 模型选型讨论（已结论，无改动）
- 维持 `qwen3.5-omni-plus`。qwen3.7-plus 虽更新更强但**仅视觉、听不到音频**，做不了台词/声部/语气；省钱选 `qwen3.5-omni-flash`（同样能听）。

---

## 进行中任务：视频分析报告「准确性校验」全面落地（4 层）

### 背景与诊断
现状只有「结构校验」（validate.js/validator.js 查时间轴倒序/重叠/超时长），**零内容校验**。用户实测见过一个重要的内容错（方向/声部/人数/色/道具朝向之一）漏过去了。目标：补齐内容准确性。

### 方案（4 层，按可靠性×成本）
- **L1 确定性地面真值**：ffprobe（时长/分辨率/画幅/帧率）+ ffmpeg 场景检测（镜头数/一镜到底）→ 对比§1，模型猜错就纠正。零模型成本。
- **L2 定向复核**：主分析后再独立喂一次视频，只问最致命的是非/选择题（走向/人数/画内外/主色/书朝向/镜头数），与报告 diff，分歧标红。+1 次模型调用。
- **L3 首帧图像接地**：抽第0帧当静态图，vision 单图分析构图，与§2 diff。+1 次 vision 调用。
- **L4 标红+台账**：前端「准确性校验」面板高亮可疑字段；追加写 `accuracy-issues.md` 台账（解决「看到错但忘了」）。

### 架构
- 新建 `server/src/lib/accuracy.js` 封装全部层，产出结构化 `accuracy` 对象
- DB reports 表加 `accuracy_json` 列（db.js 幂等迁移）
- 接进 `analysis.service.run()`（在时间轴校验后、落盘前）
- 前端 `ReportViewer.vue` 加展示
- 各层用 `config.accuracy.*` 开关可单独关

### 关键复用件（已确认存在）
- video-analyzer.js: `probeDuration` / `extractFrames` / `toImageDataUrl` / `toVideoDataUrl`（未导出，需在 accuracy.js 自带或导出）
- dashscope.js: `callDashScope(contentItems, {maxTokens})`（单图传 image_url 即可做 vision）
- §1/§2 解析正则参考 validator.js 的 `##\s*N[\.．]` 段抓取

### 分块进度（每块完成即更新）
- [x] Block A — L1 确定性地面真值（config.accuracy 开关 + accuracy.js: probeMeta/aspectLabel/detectScenes/extractSection/layerGroundTruth）。ffprobe 缺失时优雅 skip。
- [x] Block B — L2 定向复核（layerRecheck：同时喂视频+报告，核对6维 direction/char_count/voice/main_color/book_face/shots，输出 JSON match）。**真实视频实测跑通**，6维全核对。
- [x] Block C — L3 首帧图像接地（layerFirstFrame：抽首帧单图核对§2构图5项）。依赖 ffmpeg，缺失时优雅 skip 已验证。
- [x] Block D — L4a 聚合+持久化（runAccuracyChecks 聚合三层+verdict pass/review/fail；appendLedger 写 accuracy-issues.md；DB 加 accuracy_json 列已迁移；report.model create/_parse 支持；analysis.service.run 在时间轴校验后插入②.5，落盘带 accuracyJson）。**完整聚合链实测跑通**。
- [x] Block E — L4b 前端展示（ReportViewer 加「准确性校验」Tab：verdict Badge + 矛盾/存疑标红黄 + 手动修正入口 + 已一致项折叠 + 各层状态含skip原因 + meta实测时长/分辨率/fps）。Vite HMR 无编译错误。
- [x] Block F — 端到端联调+lint（node --check 全过；项目无 eslint 配置=既有问题；**完整 run() 实测跑通**：分析→时间轴→准确性②.5→提示词→落盘→DB accuracyJson 读回完整；测试任务已清理）

## ✅ 全部完成（4层准确性校验已上线）
新增/改动文件：
- server/src/lib/accuracy.js（新，全部4层逻辑）
- server/src/config.js（+accuracy 开关段）
- server/src/models/db.js（+accuracy_json 迁移）
- server/src/models/report.model.js（create/_parse 支持 accuracyJson）
- server/src/services/analysis.service.js（import + run() 插入②.5 + 落盘带 accuracyJson）
- client/src/components/business/ReportViewer.vue（+准确性校验 Tab/computed/面板）

后端已重启加载新代码（:3000），前端 HMR 已更新（:5173）。

## ✅ ffmpeg 已装（L1+L3 全部生效）
机器无 winget/choco，改为直接下载 gyan.dev 静态构建 ffmpeg 8.1.1 → 解压到 `C:\ffmpeg` → 加用户 PATH。
**重要**：会话内后端进程需用 `export PATH="/c/nvm4w/nodejs:/c/ffmpeg/bin:$PATH"` 启动才能用 ffmpeg（PATH 过期）；新开 PowerShell 窗口则已自动含 ffmpeg。
detectScenes 阈值从 0.4 调到 0.5（减少口播快剪误报）。
e2e 实测三层全跑：L1 检出"一镜到底 vs 4处硬切"，L2 抓出移动方向矛盾(verdict=fail)，L3 执行5项构图核对。
关开关：环境变量 ACCURACY_RECHECK=false / ACCURACY_FIRST_FRAME=false / ACCURACY_GROUND_TRUTH=false / ACCURACY_LEDGER=false

## ✅ ESLint 已修
原 lint 脚本因无 eslint.config.js 完全跑不起来（eslint 9 需 flat config）。
新增 server/eslint.config.js（CommonJS）+ client/eslint.config.js（Vue3 flat）。
两端 `npm run lint` 现在 exit 0 全绿。修掉真实问题：dashscope URL globals、video-analyzer 未用 platform 参数、Button.vue 未用 props、TaskView 未用 e。

## ✅ 已提交并推送 GitHub（第一轮）
commit a455c75（14 files, +884/-8）→ origin/main 推送成功。
git identity 配为仓库既有作者 lanmoxia <mrli2902933052@gmail.com>（仓库级，非全局）。
accuracy-issues.md 已加 .gitignore（运行时台账，不进库）。.claude/settings.local.json 故意不提交（本机权限设置）。

---

## 第二轮：采纳外部 AI 评审，L2 升级为盲审（已完成）
外部 AI 指出 L2 原实现的锚定缺陷（看着报告自审=心理安慰）。采纳3点，过度设计部分（6-Agent/多模型/抽8帧/JSON取代报告/硬停）拒绝。

### 改动（全部在 accuracy.js + analysis.service.js）
1. **L2 改盲审+字段级比对**：
   - 定义 FATAL_FIELDS（10个致命字段，带枚举值可程序比对）：char_count/is_one_take/shot_count/subject_position/entry_direction/movement_direction/voice_type/speaker_count/book_face/camera_motion
   - extractFactSheet(report)：纯文本调用，从报告抽10字段（只读报告不动）
   - blindVerify(video)：只看视频答封闭题，**不给报告**（破锚定）
   - 两路 Promise.all 并行 → normVal 归一化 → 逐字段 diff：两边都确定且不等=error；一边不确定=warn；都不确定=info；相等=ok
2. **致命字段事实表**：散文报告保持主产物不变，额外抽事实表专供校验（拒绝"JSON取代报告"）
3. **堵下游泄漏**：buildConflictNote(accuracy) 把 error 级冲突字段渲染成警示段，注入 generateDoubaoPrompts 的 commonContext。按 CLAUDE.md 批处理原则**不硬停、强标注**（拒绝外部AI的"禁止生成"）。run() 传 conflictNote；regenerate 路径默认""不受影响。
   - accuracy 顶层新增 conflictFields（error级字段+两边取值）
4. 前端：准确性面板加"🛡已自动规避"提示，显示提示词跳过了哪些冲突字段。

### 实测对比（同一视频 2段）
- 旧版(看报告自审)：6维全 OK
- 新版(盲审)：抓出**镜头数 2vs3、人物入画方向 already_present vs from_right** 两处真矛盾
- e2e：verdict=fail，conflictNote 注入，生成的提示词确实没写入画方向（规避生效，未硬停照常出词）
- 证明外部AI的核心批评正确：盲审显著强于自审。

### detectScenes 阈值 0.4→0.5（减口播快剪误报）

待提交：第二轮全部改动。

### accuracy 数据结构（前端用）
report.accuracyJson = {
  findings: [{layer:'L1|L2|L3', level:'error|warn|info|ok', field, claim, truth, msg}],  // 已按 error→ok 排序
  errors:[], warnings:[],
  summary:{errors,warnings,infos,oks,verdict:'pass|review|fail'},
  layers:{groundTruth,recheck,firstFrame},  // 各层 skipped/reason 或 findings
  meta:{duration,width,height,fps,...}|null
}

### ⚠ 环境缺口（需用户处理）
**这台机器没装 ffmpeg/ffprobe**（where 查无）。影响：L1 地面真值、L3 抽帧、现有 >14MB 压缩降级、validate 时长校验全部降级跳过。
建议装：`winget install Gyan.FFmpeg`（或 BtbN 版），装完重开窗口。视频直传分析本身不需要它（用户那条 `2段` 已分析成功落盘）。

### 接力提示
- 重启服务记得 `export PATH="/c/nvm4w/nodejs:$PATH"`（会话内 PATH 过期），或开新 PowerShell 窗口
- 改完 server 代码后端有 nodemon 吗？当前是 `node app.js`（非 dev），需手动重启后端进程

---

## 第三轮：可灵（kling）提示词生成（进行中）

### 现状诊断
可灵是"空壳通道"：前端入口/上传/DB platform 字段/case按platform检索 全有，但 run() 里 `if (platform==="douban")` 才生成，**kling 选了啥都不生成，提示词Tab空**。可灵生成逻辑完全不存在。

### 用户拍板的设计
- 分镜来源：**报告§1/§7 为主 + L1 detectScenes(ffmpeg切点) 双保校验**
- 多版本：**要**（简洁版/复杂版/带时间戳详细版，具体模板后期再定）
- 落库：**复用 doubao_prompts_json 字段**（不新建列），前端按 platform 区分渲染
- 每镜多版：可灵逐镜，结构为 [{shot,startSec,endSec,versions:[{strategy,text}...]}] 或类似
- 改动范围：Claude 自行规划

### 可灵 vs 豆包本质差异
| | 豆包 | 可灵 |
|---|---|---|
| 输出 | 1段散文 | 逐镜N段 |
| 触发 | ≤10s | >10s |
| @引用 | 数字序号 | @角色图/@场景图/@道具书图，二镜起@上一镜最后帧 |
| 每镜6段 | — | 技术头→起始画面→场景+@→台词→书→运镜+时长 |
- 不复用 generateDoubaoPrompts 的3版策略；新建 generateKlingPrompts。

### 分块（K-A..K-F）
- [ ] K-A 分镜解析（parseShotsFromReport + detectScenes双保）
- [ ] K-B generateKlingPrompts 逐镜×多版
- [ ] K-C run() 平台分叉
- [ ] K-D 前端按platform渲染逐镜卡片
- [ ] K-E regenerate适配 + 联调 + lint
- [ ] K-F 接力+git推送

### 关键复用件
- accuracy.js: detectScenes(切点), buildConflictNote(冲突注入), extractSection(抓§N)
- analysis.service.js: getChinaDateInfo/buildRefImagesNote/buildScriptNote/stripTitle 可共享
- run() 分叉点在 analysis.service.js:397
- regenerate端点 tasks.route.js:159（目前写死 generateDoubaoPrompts，K-E要按platform分叉）

### 可灵任务全部完成（K-A..K-F ✅）
- K-A parseShots：§7/§1 解析镜头 + ffmpeg detectScenes 双保（差≥2镜给note告警）
- K-B generateKlingPrompts：每镜1次调用返回3版（简洁/复杂/详细），错误降级占位
- K-C run() 平台分叉：kling→逐镜，douban→3版；统一落 doubao_prompts_json（kling存{kind:'kling',shots:[...],note}）
- K-D 前端：isKling computed，逐镜卡片（镜号/时间/版本切换/复制本镜/打开可灵），Tab名随平台变（豆包/可灵提示词）
- K-E regenerate端点按平台分叉 + regenerateKlingPrompts（轻量，不带conflictNote）
- 文件：新增 server/src/lib/kling.js；改 analysis.service.js / tasks.route.js / ReportViewer.vue

### e2e 实测（新key配额已恢复，qwen3.5-omni-plus 确认）
强制 platform=kling 跑 10s 视频：分镜2镜(§7) + ffmpeg检出5镜→note正确告警；逐镜3版生成质量好；
@引用正确（镜1=@构图参考图，镜2=以上一镜最后帧）；季节适配夏季短袖；准确性5矛盾照常检出+注入；
kind:kling 正确落库。前后端 lint 全绿，HMR 无错。测试数据已清理。

### 可灵模板待办（用户说后期讨论）
当前3版模板是初始可用版（KLING_VERSIONS in kling.js）。后续可调简洁/复杂/详细的具体结构。

### 注意
- 现有两条测试视频都≤10s，没有真正>10s的可灵实战素材；逻辑已验证，等真实长视频。
- 分镜note：报告分镜常比ffmpeg少（口播快切），note会频繁告警，属预期；以报告为准。

---

## 第四轮：L2 致命字段扩到 12（采纳外部建议的有效部分）
外部AI建议"二遍复核查谁先说话/画外音/看镜头"。核对后：画外音/镜头运动/书朝向我们已有；
真缺口是「说话顺序」（我们只有voice_type+speaker_count，无顺序）。补2个字段，拒绝时间点类校验（模型估时漂移会频繁误报）。

- FATAL_FIELDS 10→12：新增
  · speak_order（声部/说话顺序）：offscreen_first/onscreen_first/single_onscreen/single_offscreen/simultaneous/no_speech/uncertain
  · look_at_camera（是否看镜头）：yes/no/partial/uncertain
- 两处JSON模板同步加键；blindVerify 加2字段判断要点
- 前端无需改（findings 通用渲染）

e2e实测：12字段全跑通；speak_order 当场抓真矛盾（报告single_onscreen vs 盲审onscreen_first，
即报告把多人先后简化成单人）——正是外部建议想堵的"谁先说话"，对台词顺序规则关键。

---

## ⚠ 重新 clone 只做一次！（重要）

**重新 clone 仅用于"家里那台第一次还没接上同步机制"这一次性破局。**
一旦两端都接上（都有最新代码 + 钩子 + gitignore 修复），**以后绝不要再删除重新 clone**。
之后两台都只走正常流程：打开 Claude → 钩子自动 git pull；离开前 push。删了重 clone 会白白丢失本地 .env / 依赖 / 未提交改动，没必要。

## ⚠ 回家/换机第一次：重新 clone（最干净，推荐）

**背景**：曾有"settings.local.json 脏导致旧钩子永远跳过 pull"的死锁。已用 c363e34 修复
（gitignore + 取消追踪）。**家里那台若还是旧本地副本，直接 pull 可能卡在旧机制里。**

**最佳解法 = 删掉家里旧副本，重新 git clone**：
- 全新 clone 自带最新代码（含忽略修复），settings.local.json 从一开始就不被追踪 → 死锁根本不存在
- 比"原地破局脚本"干净得多，无需理解死锁（之前写的 unstick 脚本已删除，多余）

```bash
# 家里：删旧副本，重新 clone
rm -rf /e/EC-Agent           # 或资源管理器删掉
git clone git@github.com:lanmoxia/EC-Agent.git /e/EC-Agent
```

clone 后一次性配置（与 git 无关，每台机器各做一次）：
- `server/.env` 填 API key（不进 git，需手动粘贴）
- 装依赖：`setup.ps1` 或 `cd server && npm install` + `cd client && npm install`
- ffmpeg：装在 `C:\ffmpeg`，**不在项目里，删项目不影响**，已装过就不用再装

## 永久工作流
- 打开新 Claude 窗口 → SessionStart 钩子自动 git pull
- 离开前 → git add -A && commit && push（跟 Claude 说一声即可）
- 永不进 git：.env / .claude/settings.local.json / node_modules / reports / accuracy-issues.md

---

## LibTV CLI 流程跑通（本次会话）

### 背景
上个窗口已完成：LibTV CLI 安装（C:\libtv）+ 登录账号（183****3561）+ 整理平台文档到 docs/。
本次窗口重连后继续。

### 跑通��证
账号：非会员，约100免费积分，只做生图测试（不生视频）。

**执行的完整 CLI 流程：**
1. `libtv account info` → 登录状态正常
2. `libtv project list` → 项目"Seedance2.0体验"（uuid: f982c7df...），上次已建好
3. `libtv project use <uuid>` → 绑定项目到当前目录（写 .libtv/project.json）
4. `libtv node list` → 上次已建2个节点（图片上传节点 + 视频生成节点，视频prompt为空未跑）
5. `libtv node create "测试生图" -t image` → 新建图片节点
6. `libtv node "测试生图" --prompt "..." -s model="Lib Navo 2" -s ratio="9:16" --run` → 生图
7. progress=100%，拿到图片 URL → **流程完整跑通**

**生成的图片**：`https://libtv-res.liblib.art/sd-gen-save-img/.../708cd8ffe8354f32850b8ebc43db9be9.png`（1536×2752，9:16）

### 结论
LibTV CLI 完整流程（登录→建项目→建节点→设参数→跑→拿结果）已验证可操作。
视频生成（Seedance 2.0 / 可灵）需积分，暂未跑；生图逻辑一致，可类推。

### 新增 gitignore 规则
- `.libtv/`（CLI本地状态：凭据+项目绑定，不进库）
- `.~lock.*`（LibreOffice锁文件）

### 文件变动
- docs/liblib-tv-overview.md（新，LibTV平台概览）
- docs/libtv-cli-commands.md（新，CLI完整命令手册）
- .gitignore（+.libtv/ + .~lock.*）
- .claude/settings.json（本地权限配置更新）

---

---

## 权限全量放行（本次会话末尾）

原 allow 列表有几十条硬编码命令，新命令一条不匹配就弹窗打断用户。
改为 6 条通配规则，项目内所有操作不再弹窗：

```json
"allow": ["Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "WebFetch(*)", "PowerShell(*)"]
```

commit: 72881c6

---

## 下一大方向（已记入 TODO.md）
视频分析报告质量提升 + 豆包提示词更精准 + LibTV 完整生产工作流（抽帧→上传主体→分镜→逐镜生成→验收→帧接续）。
三个方向均有拆解，待下次会话专项讨论后开工。

---

## 当前提交基线
- 9d05a93 记录下一大方向到 TODO
- 72881c6 权限改为全量放行

---

## 第五轮：豆包多账户一键切换 + Edge打开 + 无水印插件（已完成）

### 需求背景
1. 系统"打开豆包"要用 Edge（Chrome 装不了 doubao-nomark 无水印插件）
2. 多个豆包账号切换烦——要列出所有账号、点击用对应账号登录态打开
3. 插件每个 Edge Profile 要装一遍 + 新Profile没登录装不了

### 落地
- **后端 server/src/routes/system.route.js（新）+ app.js 注册 /api/system**
  · GET /edge-profiles：读 Edge `Local State` 的 profile.info_cache，返回 [{dir,name}]
  · POST /open-edge {url,profile?}：后端 spawn msedge.exe（完整路径，兜底 cmd start），
    profile 参数指定 --profile-directory（带白名单校验防注入）以对应账号登录态打开
  · Edge 路径：C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
- **前端 EdgeDoubaoLauncher.vue（新）**：账户按钮组
  · 点账户名=用该Profile打开豆包；悬浮=弹菜单切额度状态
  · 状态：normal绿/update黄/empty红（默认绿），文案"正常/待更新额度/额度用完"
  · 状态存本机 localStorage（key=ec-doubao-acct-status），Edge Profile 本就是本机的
- **ReportViewer.vue**：两处"打开豆包"换成 <EdgeDoubaoLauncher>，挂载拉账户列表
- 当前机器 Edge Profile：Default=大包 / Profile 1=2包 / Profile 2=musk / Profile 3=huaxie

### 无水印插件：注册表强制安装（已执行）
插件每Profile装一遍太烦+新Profile装不了 → 用 Edge 策略强制安装：
```
reg add "HKCU\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist" /v 1 /t REG_SZ /d "hjlplfcnpgglfdjafekcgahffdengaij;https://edge.microsoft.com/extensionwebstorebase/v1/crx" /f
```
扩展ID hjlplfcnpgglfdjafekcgahffdengaij（doubao-nomark）。重启Edge后所有Profile自动装、无需登录微软、永久。
副作用：Edge显示"由组织管理"（无害）。撤销：删该注册表项+重启。
**注意：这是注册表操作，不进git，换机（家里）需重新执行这条命令。**

### doubao-nomark 资源
- Edge扩展ID：hjlplfcnpgglfdjafekcgahffdengaij
- 油猴脚本：greasyfork.org/zh-CN/scripts/561907（名为"图片提取"，视频支持待实测）
- 本地服务（未用）：FastAPI，GET /parse-video?url=分享链接 返回无水印地址

### 验收：用户已确认账户标签颜色+悬浮切换状态正常

---

## 📌 换机首次设置 → 见 SETUP-NEW-MACHINE.md
新机器(家/公司)首次打开,所有"不进git、每台各做一次"的设置(Node22/.env/依赖/ffmpeg/Edge无水印插件注册表)
都整合进了根目录 **SETUP-NEW-MACHINE.md**,照着执行即可。
让 Claude 跑就说:"按 SETUP-NEW-MACHINE.md 执行换机设置"。
