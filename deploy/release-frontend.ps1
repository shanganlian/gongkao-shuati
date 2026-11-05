# 仅更新前端（不动 612MB 题库、不动 pm2 API）
# 用法：powershell -ExecutionPolicy Bypass -File deploy/release-frontend.ps1
#       powershell -ExecutionPolicy Bypass -File deploy/release-frontend.ps1 -SkipBuild   # 复用已有 dist
#
# 做的事：vite build（跳过 public/data 拷贝）-> 本地产物自检
#        -> 传 dist/assets 到线上 dist、dist/index.html 到 /tmp
#        -> 远端脚本备份旧 index.html 后原子替换 -> nginx -t/reload -> HTTP 自检
#        -> 任一步失败自动回滚旧 index.html 并再次 reload
# 远端校验脚本以 LF 落盘后 scp 上传执行（不要改回 "| ssh host bash -s"，CRLF 会让 bash 报 invalid option name）
[CmdletBinding()]
param(
    [string]$Server = "47.106.172.207",
    [string]$User = "root",
    [string]$RemoteDist = "/var/www/bideti/current/dist",
    [string]$Domain = "igoiget.com",
    [switch]$SkipBuild,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

foreach ($cmd in @("ssh", "scp")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "未找到 $cmd（Windows 可选功能 OpenSSH Client）"
    }
}

if (-not $SkipBuild) {
    Write-Host "==> 构建前端（SKIP_PUBLIC_COPY=1，不拷贝题库）"
    $env:SKIP_PUBLIC_COPY = "1"
    & cmd.exe /c "npm.cmd run build"
    if ($LASTEXITCODE -ne 0) { throw "构建失败" }
}

$indexPath = Join-Path $repoRoot "dist/index.html"
$assetsDir = Join-Path $repoRoot "dist/assets"
if (-not (Test-Path -LiteralPath $indexPath)) { throw "缺少 dist/index.html，请先构建" }
if (-not (Test-Path -LiteralPath $assetsDir)) { throw "缺少 dist/assets，请先构建" }

$assetCount = (Get-ChildItem -File -LiteralPath $assetsDir).Count
if ($assetCount -eq 0) { throw "dist/assets 为空，构建异常" }
$builtAt = (Get-Item -LiteralPath $indexPath).LastWriteTime
Write-Host "==> 产物：index.html（$($builtAt.ToString('yyyy-MM-dd HH:mm:ss'))）+ $assetCount 个资源文件"
Write-Host "    题库目录 dist/data 未参与构建，也不会被上传"

Write-Host "==> 本地自检：index.html 引用的资源是否都在 dist 里"
$html = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
if ($html -notmatch '必得题库') { throw "dist/index.html 里没有品牌名「必得题库」，构建异常" }
$refs = [regex]::Matches($html, '/assets/[^"'' >]+\.(?:js|css)') | ForEach-Object { $_.Value } | Sort-Object -Unique
if (@($refs).Count -eq 0) { throw "dist/index.html 未引用任何 /assets 资源，构建异常" }
foreach ($ref in $refs) {
    $localFile = Join-Path $repoRoot ("dist" + ($ref -replace '/', '\'))
    if (-not (Test-Path -LiteralPath $localFile)) { throw "缺少被引用的资源：$ref" }
}
Write-Host "    OK：$(@($refs).Count) 个入口资源齐备"

$remoteScript = @'
#!/usr/bin/env bash
# 由 deploy/release-frontend.ps1 生成；必须以 LF 换行执行
set -eu
DIST="__REMOTE_DIST__"
DOMAIN="__DOMAIN__"
NEW_HTML="__NEW_HTML__"
PREV_HTML="${NEW_HTML}.prev"

restore() {
  if [ -f "$PREV_HTML" ]; then
    install -m 644 "$PREV_HTML" "$DIST/index.html" || true
    nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
    echo "rolled back to previous index.html" >&2
  fi
}
fail() { echo "FAIL: $1" >&2; restore; exit 1; }

[ -s "$NEW_HTML" ] || fail "uploaded index.html missing or empty"

cp -f "$DIST/index.html" "$PREV_HTML"
install -m 644 "$NEW_HTML" "$DIST/index.html"
chmod -R a+rX "$DIST/assets" "$DIST/index.html"

nginx -t || fail "nginx -t failed"
systemctl reload nginx || fail "nginx reload failed"
echo "nginx reloaded"

if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  BASE="https://$DOMAIN"
  CURL=(curl -k -sS --resolve "$DOMAIN:443:127.0.0.1")
else
  BASE="http://127.0.0.1"
  CURL=(curl -sS -H "Host: $DOMAIN")
fi

code=$("${CURL[@]}" -o /tmp/bideti-home.html -w '%{http_code}' "$BASE/") || fail "curl home failed"
echo "home HTTP=$code"
[ "$code" = "200" ] || fail "home not 200"

grep -q '<div id="root">' /tmp/bideti-home.html || fail "#root missing in index.html"

main_js=$(grep -o '/assets/[^"]*\.js' /tmp/bideti-home.html | head -n 1 || true)
[ -n "$main_js" ] || fail "no /assets entry js referenced"
js_code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE$main_js") || fail "curl entry js failed"
echo "entry JS HTTP=$js_code ($main_js)"
[ "$js_code" = "200" ] || fail "entry js not reachable: $main_js"

rm -f /tmp/bideti-home.html "$PREV_HTML"
echo "frontend release done"
'@

# 关键：这里字符串来自 .ps1 的 CRLF 文件，直接 pipe 给 ssh 会让 bash 读到 "pipefail\r"
# （报 invalid option name），所以必须先归一化成 LF 再落盘，用 scp 传脚本、ssh 执行文件。
$remoteScript = $remoteScript.Replace("`r`n", "`n").Replace("`r", "`n")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$remoteSh = "/tmp/bideti-frontend-$stamp.sh"
$remoteHtml = "/tmp/bideti-index-$stamp.html"

$remoteScript = $remoteScript.Replace('__REMOTE_DIST__', $RemoteDist).Replace('__DOMAIN__', $Domain).Replace('__NEW_HTML__', $remoteHtml)

$tmpSh = Join-Path $env:TEMP "bideti-frontend-$stamp.sh"
[System.IO.File]::WriteAllText($tmpSh, $remoteScript, (New-Object System.Text.UTF8Encoding($false)))

$bash = "C:\Program Files\Git\bin\bash.exe"
if (Test-Path -LiteralPath $bash) {
    & $bash --noprofile --norc -n ($tmpSh -replace '\\', '/')
    if ($LASTEXITCODE -ne 0) { throw "远端脚本语法检查未通过（bash -n）：$tmpSh" }
    Write-Host "==> 远端脚本已生成并通过 bash -n 语法检查：$tmpSh"
} else {
    Write-Host "==> 远端脚本已生成：$tmpSh（未找到 Git Bash，跳过 bash -n）"
}

if ($DryRun) {
    Write-Host ""
    Write-Host "==> DryRun：仅本地构建、产物自检与脚本生成，跳过上传/nginx reload"
    Write-Host "    可直接查看：$tmpSh"
    return
}

$remote = "$User@$Server"

Write-Host "==> 上传静态资源（先资源、后入口，避免线上拿到半截版本）"
& scp -r $assetsDir "${remote}:$RemoteDist/"
if ($LASTEXITCODE -ne 0) { throw "上传 assets 失败" }

Write-Host "==> 上传 index.html 到 $remoteHtml（由远端脚本备份后原子替换）"
& scp $indexPath "${remote}:$remoteHtml"
if ($LASTEXITCODE -ne 0) { throw "上传 index.html 失败" }

Write-Host "==> 上传校验脚本 $remoteSh"
& scp $tmpSh "${remote}:$remoteSh"
if ($LASTEXITCODE -ne 0) { throw "上传校验脚本失败" }

Write-Host "==> 远端：备份 index.html -> 替换 -> reload -> 健康检查（失败自动回滚）"
# 单次 ssh：执行脚本并在远端清理临时文件，再用 rc 透传退出码（避免再次触发密码输入）
& ssh $remote "bash $remoteSh; rc=`$?; rm -f $remoteSh $remoteHtml $remoteHtml.prev; exit `$rc"
$remoteExit = $LASTEXITCODE

Remove-Item -LiteralPath $tmpSh -Force -ErrorAction SilentlyContinue

if ($remoteExit -ne 0) { throw "远端 reload/健康检查失败（退出码 $remoteExit）" }

Write-Host ""
Write-Host "发布成功：$Domain（仅前端资源，题库与 API 未改动）"
