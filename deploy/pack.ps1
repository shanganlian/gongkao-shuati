[CmdletBinding()]
param(
    [string]$OutDir = "",
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Invoke-Npm {
    param([string]$CommandLine)
    & cmd.exe /c "npm.cmd $CommandLine"
    if ($LASTEXITCODE -ne 0) {
        throw "npm 命令失败：npm $CommandLine"
    }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "未找到 node，请先安装 Node 24 LTS"
}
$nodeVersion = (& node -p "process.versions.node").Trim()
$nodeMajor = [int]($nodeVersion.Split(".")[0])
if ($nodeMajor -lt 24) {
    Write-Warning "当前 Node $nodeVersion，建议使用 24 LTS"
}

if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    throw "未找到 tar（Windows 10/11 自带 bsdtar）"
}

if (-not $SkipInstall) {
    Write-Host "==> npm ci"
    Invoke-Npm "ci --no-audit --no-fund"
}

Write-Host "==> npm run build"
Invoke-Npm "run build"

if (-not (Test-Path -LiteralPath "dist/index.html")) {
    throw "构建产物 dist/index.html 不存在"
}

$outDirResolved = if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $repoRoot
} else {
    $OutDir
}
New-Item -ItemType Directory -Force -Path $outDirResolved | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archiveName = "bideti-release-$stamp.tar.gz"
$archivePath = Join-Path $outDirResolved $archiveName

Write-Host "==> 打包 $archiveName"
& tar -czf $archivePath dist server.ts shared src package.json package-lock.json tsconfig.json deploy
if ($LASTEXITCODE -ne 0) {
    throw "tar 打包失败"
}

$entries = & tar -tzf $archivePath
foreach ($required in @("dist/index.html", "server.ts", "package-lock.json", "deploy/ecosystem.config.cjs")) {
    if ($entries -notcontains $required) {
        throw "发布包缺少 $required"
    }
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
$shaPath = "$archivePath.sha256"
# 必须用 LF：Linux 的 sha256sum -c 不会自动去掉 CR，CRLF 会导致文件名不匹配
[System.IO.File]::WriteAllText($shaPath, "$hash  $archiveName`n", [System.Text.Encoding]::ASCII)

$sizeMb = [math]::Round((Get-Item -LiteralPath $archivePath).Length / 1MB, 1)
Write-Host ""
Write-Host "发布包：$archivePath ($sizeMb MB)"
Write-Host "校验文件：$shaPath"
Write-Host "上传命令：powershell -ExecutionPolicy Bypass -File deploy/upload.ps1 -Archive `"$archivePath`""
Write-Host ""
Write-Host "提示：包内不含 node_modules、.env、.git；服务器会执行 npm ci --omit=dev。"
