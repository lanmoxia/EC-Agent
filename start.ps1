# start.ps1 — 一键拉起 EC-Agent 前后端（各开一个新 PowerShell 窗口常驻）
# 双击桌面快捷方式即可。关掉对应窗口 = 停掉对应服务。

$ErrorActionPreference = "Stop"
$root = "E:\EC-Agent"
$pathPrefix = "C:\nvm4w\nodejs;C:\ffmpeg\bin"

# 后端窗口（:3000）
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "`$Host.UI.RawUI.WindowTitle='EC-Agent 后端 :3000'; `$env:Path='$pathPrefix;' + `$env:Path; cd '$root\server'; node app.js"
)

# 前端窗口（:5173）— 稍等 2 秒让后端先起，前端要代理 /api
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "`$Host.UI.RawUI.WindowTitle='EC-Agent 前端 :5173'; `$env:Path='$pathPrefix;' + `$env:Path; cd '$root\client'; npm run dev"
)

Write-Host ""
Write-Host "两端已拉起：" -ForegroundColor Green
Write-Host "  前端  http://localhost:5173   <- 浏览器打开这个" -ForegroundColor Cyan
Write-Host "  后端  http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "（这两个新窗口保持开着；关闭即停服务。本窗口可关。）" -ForegroundColor DarkGray
Start-Sleep -Seconds 4
