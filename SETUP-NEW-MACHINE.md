# 换机首次设置清单（家/公司切换必读）

> 这些是**不进 git、每台机器各做一次**的设置。clone 下来后照着执行即可。
> 让 Claude 执行时直接说："按 SETUP-NEW-MACHINE.md 执行换机设置"。
> 全部做完一次后，以后这台机器只需"打开 Claude → 自动 git pull → 干活"。

---

## 0. 前提：已 clone 项目
```bash
git clone git@github.com:lanmoxia/EC-Agent.git /e/EC-Agent
```
（项目路径默认 `e:\EC-Agent`，下文命令按此。若放别处自行替换。）

---

## 1. Node 22（nvm-windows）
确认 `node -v` 是 v22.x。不是则：
```bash
nvm install 22
nvm use 22
```
⚠ 别用 Node 24——better-sqlite3 原生模块绑死 22，换 24 后端会崩。

---

## 2. server/.env 填 API key（不进 git，必须手填）
创建 `server/.env`，内容：
```
DASHSCOPE_API_KEY=sk-你的百炼key
```
模型默认 qwen3.5-omni-plus，无需额外配置。

---

## 3. 装依赖
```bash
# 项目根
powershell -ExecutionPolicy Bypass -File setup.ps1
# 或手动：
cd server && npm install
cd ../client && npm install
```

---

## 4. ffmpeg（L1地面真值/L3抽帧/压缩降级 需要）
若 `ffprobe -version` 不可用，下载 gyan.dev 静态构建解压到 `C:\ffmpeg`，把 `C:\ffmpeg\bin` 加进用户 PATH。
PowerShell 一把梭：
```powershell
$url='https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
$zip="$env:TEMP\ffmpeg.zip"
Invoke-WebRequest $url -OutFile $zip
Expand-Archive $zip "$env:TEMP\ffmpeg-x" -Force
$inner=Get-ChildItem "$env:TEMP\ffmpeg-x" -Directory | Select-Object -First 1
if(Test-Path 'C:\ffmpeg'){Remove-Item 'C:\ffmpeg' -Recurse -Force}
Move-Item $inner.FullName 'C:\ffmpeg'
$u=[Environment]::GetEnvironmentVariable('PATH','User')
if($u -notlike '*C:\ffmpeg\bin*'){[Environment]::SetEnvironmentVariable('PATH',$u.TrimEnd(';')+';C:\ffmpeg\bin','User')}
```

---

## 5. 豆包无水印插件：Edge 注册表强制安装（一次性）
让 Edge 所有账户 Profile 自动装上 doubao-nomark 无水印插件（免登录微软、永久）：
```bash
reg add "HKCU\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist" //v 1 //t REG_SZ //d "hjlplfcnpgglfdjafekcgahffdengaij;https://edge.microsoft.com/extensionwebstorebase/v1/crx" //f
```
> 执行后**重启 Edge**，各 Profile 自动装上插件。会出现"由组织管理"提示（无害）。
> 撤销：`reg delete "HKCU\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist" /f` 后重启 Edge。
> 扩展ID：hjlplfcnpgglfdjafekcgahffdengaij（豆包多账号一键切换功能会自动读本机 Edge Profile，不用配）

---

## 6. 启动服务（会话内进程要注入 PATH）
```bash
export PATH="/c/nvm4w/nodejs:/c/ffmpeg/bin:$PATH"   # 会话内 bash 必加，新 PowerShell 窗口不用
cd server && node app.js          # 后端 :3000
cd client && npm run dev          # 前端 :5173（另开窗口）
```

---

## 完成后
以后这台机器：打开 Claude → SessionStart 钩子自动 git pull → 直接干活。
本清单只在"全新机器/重装"时跑一次。
