# EC-Agent 环境检测 + 依赖安装脚本
# 每次到新机器第一次运行，之后有变动时再跑
# 用法：在项目根目录执行 .\setup.ps1

Write-Host ""
Write-Host "=== EC-Agent 环境检测 ===" -ForegroundColor Cyan
Write-Host ""

$allOk = $true

# ── 1. 检测 nvm-windows ───────────────────────────────────────────
Write-Host "[1/5] 检测 nvm-windows..." -NoNewline
$nvmOk = $false
try {
    $nvmVer = nvm version 2>&1
    if ($nvmVer -match "\d+\.\d+") {
        Write-Host " ✓ nvm $nvmVer" -ForegroundColor Green
        $nvmOk = $true
    } else { throw }
} catch {
    Write-Host " ✗ 未安装" -ForegroundColor Red
    Write-Host ""
    Write-Host "  nvm-windows 未检测到，请安装（只需装一次）：" -ForegroundColor Yellow
    Write-Host "  方式1 - winget 命令（推荐，管理员 PowerShell 执行）：" -ForegroundColor Yellow
    Write-Host "    winget install CoreyButler.NVMforWindows" -ForegroundColor White
    Write-Host "  方式2 - 手动下载安装包：" -ForegroundColor Yellow
    Write-Host "    https://github.com/coreybutler/nvm-windows/releases/latest" -ForegroundColor White
    Write-Host "    下载 nvm-setup.exe，安装完成后重新打开 PowerShell 再跑此脚本" -ForegroundColor Yellow
    Write-Host ""
    $allOk = $false
}

# ── 2. 检测/切换 Node.js 版本 ─────────────────────────────────────
Write-Host "[2/5] 检测 Node.js 版本..." -NoNewline
$requiredNode = "22"
$nodeOk = $false
try {
    $nodeVer = node --version 2>&1
    if ($nodeVer -match "^v(\d+)") {
        $major = [int]$Matches[1]
        if ($major -eq [int]$requiredNode) {
            Write-Host " ✓ $nodeVer" -ForegroundColor Green
            $nodeOk = $true
        } else {
            Write-Host " ✗ 当前 $nodeVer，需要 v$requiredNode" -ForegroundColor Red
        }
    }
} catch {
    Write-Host " ✗ Node.js 未找到" -ForegroundColor Red
}

if (-not $nodeOk -and $nvmOk) {
    Write-Host "  → 使用 nvm 安装并切换到 Node $requiredNode..." -ForegroundColor Yellow
    nvm install $requiredNode 2>&1 | Out-Null
    nvm use $requiredNode 2>&1 | Out-Null
    $nodeVer = node --version 2>&1
    if ($nodeVer -match "^v$requiredNode") {
        Write-Host "  ✓ 已切换到 $nodeVer" -ForegroundColor Green
        $nodeOk = $true
    } else {
        Write-Host "  ✗ 切换失败，请手动执行：nvm install $requiredNode && nvm use $requiredNode" -ForegroundColor Red
        $allOk = $false
    }
} elseif (-not $nodeOk) {
    $allOk = $false
}

# ── 3. 检测 server/.env ───────────────────────────────────────────
Write-Host "[3/5] 检测 server/.env..." -NoNewline
if (Test-Path "server\.env") {
    $envContent = Get-Content "server\.env" -Raw
    if ($envContent -match "DASHSCOPE_API_KEY=sk-") {
        Write-Host " ✓ 已配置" -ForegroundColor Green
    } else {
        Write-Host " ✗ 文件存在但 DASHSCOPE_API_KEY 未填写" -ForegroundColor Red
        Write-Host "  请在 server/.env 填入：DASHSCOPE_API_KEY=sk-你的key" -ForegroundColor Yellow
        $allOk = $false
    }
} else {
    Write-Host " ✗ 不存在" -ForegroundColor Red
    Write-Host "  请创建 server/.env，内容：" -ForegroundColor Yellow
    Write-Host "    DASHSCOPE_API_KEY=sk-你的key" -ForegroundColor White
    $allOk = $false
}

# ── 4. 安装 server 依赖 ───────────────────────────────────────────
Write-Host "[4/5] 检测 server 依赖..." -NoNewline
if (Test-Path "server\node_modules\express") {
    Write-Host " ✓ 已安装" -ForegroundColor Green
} else {
    Write-Host " 安装中..." -ForegroundColor Yellow
    Push-Location server
    npm install 2>&1 | Out-Null
    Pop-Location
    if (Test-Path "server\node_modules\express") {
        Write-Host "  ✓ 安装完成" -ForegroundColor Green
    } else {
        Write-Host "  ✗ 安装失败，请手动执行：cd server && npm install" -ForegroundColor Red
        $allOk = $false
    }
}

# ── 5. 安装 client 依赖 ───────────────────────────────────────────
Write-Host "[5/5] 检测 client 依赖..." -NoNewline
if (Test-Path "client\node_modules\vite") {
    Write-Host " ✓ 已安装" -ForegroundColor Green
} else {
    Write-Host " 安装中..." -ForegroundColor Yellow
    Push-Location client
    npm install 2>&1 | Out-Null
    Pop-Location
    if (Test-Path "client\node_modules\vite") {
        Write-Host "  ✓ 安装完成" -ForegroundColor Green
    } else {
        Write-Host "  ✗ 安装失败，请手动执行：cd client && npm install" -ForegroundColor Red
        $allOk = $false
    }
}

# ── 结果汇总 ─────────────────────────────────────────────────────
Write-Host ""
if ($allOk) {
    Write-Host "=== 环境就绪，可以开始开发 ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "启动命令：" -ForegroundColor Cyan
    Write-Host "  后端：cd server; node app.js        (localhost:3000)"
    Write-Host "  前端：cd client; npm run dev         (localhost:5173)"
} else {
    Write-Host "=== 有未解决的问题，请按上方提示处理后重新运行 .\setup.ps1 ===" -ForegroundColor Red
}
Write-Host ""
