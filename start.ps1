# start.ps1 - launch EC-Agent backend(:3000) + frontend(:5173) hidden, no window.
# Called by start-silent.vbs (via wscript) so nothing flashes on screen.
# Stop with the "Stop EC-Agent" shortcut (stop.ps1) which kills :3000/:5173.

$root = "E:\EC-Agent"
$env:Path = "C:\nvm4w\nodejs;C:\ffmpeg\bin;" + $env:Path

# backend
Start-Process -FilePath "node" -ArgumentList "app.js" `
  -WorkingDirectory "$root\server" -WindowStyle Hidden

# frontend (let backend come up first; frontend proxies /api)
Start-Sleep -Seconds 2
Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev" `
  -WorkingDirectory "$root\client" -WindowStyle Hidden
