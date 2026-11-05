# 仅更新题库数据（public/data -> 线上 dist/data），不动前端产物、不重载 nginx、不重启 API
# 用法：
#   npm run release:data
#   powershell -ExecutionPolicy Bypass -File deploy/release-data.ps1 -DryRun
#   powershell -ExecutionPolicy Bypass -File deploy/release-data.ps1 -Scopes all
#
# 做的事：
#   1) 本地重建 index.json / idMap.json（--SkipIndex 可跳过）
#   2) 对 public/data 下选定目录做 SHA256 清单，与服务器远端清单逐文件比对
#   3) 只把「新增 + 改动」文件打成一个 tar.gz 上传，未改动分片一个都不传
#   4) 远端解包 -> sha256sum -c 校验 -> 备份旧文件 -> 先分片、后 index/idMap 替换
#   5) 健康检查：index / idMap / 每个改动分片 HTTP 200 / index 引用完整 / E10 标记探针
#   6) 任一步失败自动用备份回滚；成功保留备份并生成 rollback.sh
#
# 远端校验脚本以 LF 落盘后 scp 上传执行（不要改回 "| ssh host bash -s"，CRLF 会让 bash 报 invalid option name）
[CmdletBinding()]
param(
    [string]$Server = "47.106.172.207",
    [string]$User = "root",
    [string]$RemoteData = "/var/www/bideti/current/dist/data",
    [string]$RemoteBackupRoot = "/var/www/bideti/data-backups",
    [string]$Domain = "igoiget.com",
    [string[]]$Scopes = @("questions", "interview"),
    [switch]$SkipIndex,
    [switch]$AllowDelete,
    [switch]$Force,
    [switch]$Offline,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# 远端清单走 Base64 传输，这里只保证本地写文件/调用原生命令不串码
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

foreach ($cmd in @("ssh", "scp", "tar")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "未找到 $cmd（ssh/scp 需要 Windows 可选功能 OpenSSH Client；tar 需要 Windows 10 1803+）"
    }
}

$dataRoot = Join-Path $repoRoot "public/data"
if (-not (Test-Path -LiteralPath $dataRoot)) { throw "缺少 public/data 目录" }

if ($Scopes -contains "all") {
    $Scopes = Get-ChildItem -LiteralPath $dataRoot -Directory | Select-Object -ExpandProperty Name
}
$Scopes = @($Scopes | Where-Object { $_ } | Select-Object -Unique)
if ($Scopes.Count -eq 0) { throw "未指定任何数据目录" }
foreach ($scope in $Scopes) {
    if (-not (Test-Path -LiteralPath (Join-Path $dataRoot $scope))) {
        throw "数据目录不存在：public/data/$scope"
    }
}

if ($Offline -and -not $DryRun) {
    throw "-Offline 只能和 -DryRun 一起用（否则会把全部分片当成新增上传）"
}
if (-not $Offline) {
    foreach ($cmd in @("ssh", "scp")) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "未找到 $cmd" }
    }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stageDir = Join-Path $env:TEMP "bideti-data-$stamp"
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
$payloadPath = Join-Path $stageDir "payload.tar.gz"
$remote = "$User@$Server"

function Write-Utf8NoBom([string]$path, [string]$text) {
    [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

# Node 输出是 UTF-8，PowerShell 5.1 按 ANSI 解码会乱码；这里用 .NET 按 UTF-8 读出来再打印
function Invoke-NodeUtf8([string]$arguments, [string]$workDir) {
    $nodeExe = (Get-Command node -ErrorAction Stop).Source
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $nodeExe
    $psi.Arguments = $arguments
    $psi.WorkingDirectory = $workDir
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $psi.StandardErrorEncoding = New-Object System.Text.UTF8Encoding($false)
    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    [void]$proc.Start()
    $errTask = $proc.StandardError.ReadToEndAsync()
    $out = $proc.StandardOutput.ReadToEnd()
    $err = $errTask.Result
    $proc.WaitForExit()
    if ($out) { Write-Host $out.TrimEnd() }
    if ($err) { Write-Host $err.TrimEnd() -ForegroundColor Red }
    return $proc.ExitCode
}

function Format-Mb([long]$bytes) {
    return "{0:N1} MB" -f ($bytes / 1MB)
}

Write-Host "==> 发布范围：$($Scopes -join ' / ')（public/data）"

if (-not $SkipIndex -and ($Scopes -contains "questions")) {
    Write-Host "==> 重建并校验 index.json / idMap.json"
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "未找到 node（重建 index/idMap 需要 Node.js）" }
    $nodeExit = Invoke-NodeUtf8 "scripts/rebuild-question-index.cjs --apply" $repoRoot
    if ($nodeExit -ne 0) { throw "index/idMap 重建或校验失败" }
} elseif (-not $SkipIndex) {
    Write-Host "==> 本次不含 questions，跳过 index/idMap 重建"
}

Write-Host "==> 计算本地 SHA256 清单（$($Scopes.Count) 个目录）"
$local = @{}
$localBytes = 0L
foreach ($scope in $Scopes) {
    $scopeRoot = Join-Path $dataRoot $scope
    $files = Get-ChildItem -LiteralPath $scopeRoot -Recurse -File
    foreach ($file in $files) {
        if ($file.Name -like ".release-data-*.txt") { continue }
        $relative = $file.FullName.Substring($dataRoot.Length + 1).Replace("\", "/")
        if ($relative -match '(^|/)\.\.(/|$)') { throw "非法路径：$relative" }
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $local[$relative] = [pscustomobject]@{
            Path = $relative
            FullName = $file.FullName
            Size = [long]$file.Length
            Sha256 = $hash
        }
        $localBytes += [long]$file.Length
    }
}
Write-Host "    $($local.Count) 个文件 / $(Format-Mb $localBytes)"

if ($Offline) {
    Write-Host "==> Offline：跳过远端清单，按全部新增处理（仅用于打包自检）"
    $remoteManifest = @{}
} else {
    Write-Host "==> 读取远端 SHA256 清单（只读，先不写线上）"
    $quotedScopes = ($Scopes | ForEach-Object { "'" + ($_ -replace "'", "'\''") + "'" }) -join " "
    $remoteCmd = "if [ -d '$RemoteData' ]; then cd '$RemoteData' && find $quotedScopes -type f -print0 2>/dev/null | sort -z | xargs -0 -r sha256sum 2>/dev/null | base64 -w 0; else echo __MISSING__; fi"
    $remoteOut = (& ssh $remote $remoteCmd) -join ""
    if ($LASTEXITCODE -ne 0) { throw "读取远端清单失败（ssh 退出码 $LASTEXITCODE）" }
    $remoteOut = $remoteOut.Trim()
    if ($remoteOut -eq "__MISSING__") {
        throw "远端数据目录不存在：$RemoteData（请确认路径，或先整包发布一次）"
    }

    $remoteManifest = @{}
    if ($remoteOut) {
        try {
            $manifestText = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($remoteOut))
        } catch {
            throw "远端清单 Base64 解码失败：$($_.Exception.Message)"
        }
        foreach ($line in ($manifestText -split "`n")) {
            if ($line -match '^([0-9a-f]{64})\s+\*?(.+)$') {
                $remoteManifest[$matches[2]] = $matches[1]
            }
        }
    }
    Write-Host "    远端 $($remoteManifest.Count) 个文件"
}

$changed = New-Object System.Collections.Generic.List[string]
$added = New-Object System.Collections.Generic.List[string]
$deleted = New-Object System.Collections.Generic.List[string]

foreach ($path in $local.Keys) {
    if (-not $remoteManifest.ContainsKey($path)) {
        $added.Add($path)
    } elseif ($remoteManifest[$path] -ne $local[$path].Sha256) {
        $changed.Add($path)
    }
}
foreach ($path in $remoteManifest.Keys) {
    if (-not $local.ContainsKey($path)) { $deleted.Add($path) }
}
$changed.Sort()
$added.Sort()
$deleted.Sort()

$upload = New-Object System.Collections.Generic.List[string]
if ($Force -or $Offline) {
    foreach ($path in $local.Keys) { $upload.Add($path) }
} else {
    foreach ($path in $added) { $upload.Add($path) }
    foreach ($path in $changed) { $upload.Add($path) }
}
$upload.Sort()

$uploadBytes = 0L
foreach ($path in $upload) { $uploadBytes += $local[$path].Size }

Write-Host ""
Write-Host "==> 差异：改动 $($changed.Count) / 新增 $($added.Count) / 远端多出 $($deleted.Count)"
Write-Host "    本次上传 $($upload.Count) 个文件 / $(Format-Mb $uploadBytes)"
if ($Force) { Write-Host "    已指定 -Force：忽略差异，全部重传" }
if ($deleted.Count -gt 0) {
    if ($AllowDelete) {
        Write-Host "    远端多出文件将删除：$($deleted.Count) 个（已指定 -AllowDelete）"
    } else {
        Write-Host "    远端多出文件保留不删（如需清理加 -AllowDelete）"
    }
}
foreach ($path in $upload | Select-Object -First 12) { Write-Host "      + $path" }
if ($upload.Count -gt 12) { Write-Host "      ... 其余 $($upload.Count - 12) 个见清单" }
if ($upload.Count -eq 0 -and ($deleted.Count -eq 0 -or -not $AllowDelete)) {
    Write-Host ""
    Write-Host "==> 线上已是最新，无需上传"
    Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
    return
}

# 生成远端要用的清单：files.txt（上传清单）/ manifest.sha256 / probe.txt（E10 探针）/ delete.txt
$filesMetaPath = Join-Path $stageDir "files.txt"
$manifestPath = Join-Path $stageDir "manifest.sha256"
$probePath = Join-Path $stageDir "probe.txt"
$deletePath = Join-Path $stageDir "delete.txt"

$filesText = ($upload -join "`n")
if ($upload.Count -gt 0) { $filesText += "`n" }
Write-Utf8NoBom $filesMetaPath $filesText

$manifestLines = New-Object System.Collections.Generic.List[string]
foreach ($path in $upload) {
    $manifestLines.Add("$($local[$path].Sha256)  $path")
}
Write-Utf8NoBom $manifestPath (($manifestLines -join "`n") + $(if ($manifestLines.Count -gt 0) { "`n" } else { "" }))

$probeLine = ""
foreach ($path in $upload) {
    if ($path -notmatch '^questions/.+\.json$') { continue }
    if ($path -match '^questions/(index|idMap|questions)\.json$') { continue }
    if ($path -notmatch '\.json$') { continue }
    $full = $local[$path].FullName
    if (-not (Select-String -LiteralPath $full -Pattern '"isAbnormal"\s*:\s*true' -Quiet)) { continue }
    try {
        $parsed = Get-Content -LiteralPath $full -Raw -Encoding UTF8 | ConvertFrom-Json
        $hit = @($parsed) | Where-Object { $_.isAbnormal -eq $true } | Select-Object -First 1
        $probeId = if ($hit) { [string]$hit.id } else { "" }
    } catch {
        $probeId = ""
    }
    $probeLine = "$path`t$probeId"
    Write-Host "==> E10 探针：$path（id=$probeId）"
    break
}
if ($probeLine) {
    Write-Utf8NoBom $probePath ($probeLine + "`n")
} elseif ($upload.Count -gt 0) {
    Write-Host "==> 本次没有命中 isAbnormal 的改动分片，跳过 E10 探针"
}

$deletePaths = New-Object System.Collections.Generic.List[string]
if ($AllowDelete) {
    foreach ($path in $deleted) { $deletePaths.Add($path) }
}
if ($deletePaths.Count -gt 0) {
    Write-Utf8NoBom $deletePath (($deletePaths -join "`n") + "`n")
}

Write-Host "==> 打包上传内容（tar.gz）"
# 注意：bsdtar 的 -T 列表必须先 Push-Location 到数据根目录、再用相对路径；
# 与 -C 组合时会把列表路径本身当成成员（实测 bsdtar 3.8.9）。
# 元数据（files.txt/manifest/probe/delete）不打进包，和 payload 一起 scp 上传。
$listName = ".release-data-$stamp.txt"
$listPath = Join-Path $dataRoot $listName
# bsdtar 读取 -T 列表时按 Windows 本地代码页解码，UTF-8 列表遇到中文分片名会找不到文件；
# 列表改用 GBK(936) 写入，tar 内部会生成 pax 头，解包后仍是正确的 UTF-8 文件名。
$tarListEncoding = New-Object System.Text.UTF8Encoding($false)
if ($filesText -match '[^\x00-\x7F]') {
    $tarListEncoding = [System.Text.Encoding]::GetEncoding(936, [System.Text.EncoderFallback]::ExceptionFallback, [System.Text.DecoderFallback]::ExceptionFallback)
}
try {
    [System.IO.File]::WriteAllText($listPath, $filesText, $tarListEncoding)
} catch {
    throw "写入 tar 列表失败（文件名含 GBK 无法表示的字符）：$($_.Exception.Message)"
}
Push-Location $dataRoot
try {
    & tar -czf $payloadPath -T $listName
    $tarExit = $LASTEXITCODE
} finally {
    Pop-Location
    Remove-Item -LiteralPath $listPath -Force -ErrorAction SilentlyContinue
}
if ($tarExit -ne 0) { throw "打包失败（tar 退出码 $tarExit）" }

$tarEntries = @(& tar -tzf $payloadPath)
if ($LASTEXITCODE -ne 0) { throw "校验 tar 包失败" }
if ($tarEntries.Count -ne $upload.Count) {
    throw "tar 包条目数异常：$($tarEntries.Count) <> $($upload.Count)"
}
$payloadSize = (Get-Item -LiteralPath $payloadPath).Length
Write-Host "    payload.tar.gz：$(Format-Mb $payloadSize)（条目 $($tarEntries.Count)）"

$remoteScript = @'
#!/usr/bin/env bash
# 由 deploy/release-data.ps1 生成；必须以 LF 换行执行
set -euo pipefail

DATA="__REMOTE_DATA__"
BACKUP_ROOT="__REMOTE_BACKUP_ROOT__"
STAMP="__STAMP__"
DOMAIN="__DOMAIN__"
META="__REMOTE_META__"
PAYLOAD="$META/payload.tar.gz"
CHECK_QUESTIONS=__CHECK_QUESTIONS__
KEEP_BACKUPS=5

log() { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

TMP="$(mktemp -d /tmp/bideti-data-check.XXXXXX)"
STAGE="$TMP/stage"
BACKUP="$BACKUP_ROOT/$STAMP"
MUTATED=0

cleanup() { rm -rf "$TMP" || true; }
trap cleanup EXIT

restore() {
  [ "$MUTATED" = "1" ] || return 0
  if [ -f "$BACKUP/files.tar.gz" ]; then
    tar -xzf "$BACKUP/files.tar.gz" -C "$DATA" || true
  fi
  if [ -s "$BACKUP/added.txt" ]; then
    while IFS= read -r p; do
      [ -n "$p" ] && rm -f "$DATA/$p"
    done < "$BACKUP/added.txt"
  fi
  chmod -R a+rX "$DATA" 2>/dev/null || true
  echo "rolled back from $BACKUP" >&2
}

fail() {
  echo "FAIL: $1" >&2
  restore
  exit 1
}

[ -f "$PAYLOAD" ] || fail "uploaded payload missing"
[ -d "$DATA" ] || fail "remote data dir missing: $DATA"

log "解包并校验上传内容"
mkdir -p "$STAGE"
tar -xzf "$PAYLOAD" -C "$STAGE" || fail "extract payload failed"
for f in files.txt manifest.sha256; do
  [ -f "$META/$f" ] || fail "upload missing $f"
done
if [ -s "$META/files.txt" ]; then
  [ -s "$META/manifest.sha256" ] || fail "manifest empty while files.txt not empty"
  (
    cd "$STAGE"
    sha256sum -c "$META/manifest.sha256" > "$TMP/verify.log" 2>&1
  ) || { tail -n 20 "$TMP/verify.log" >&2 || true; fail "payload sha256 mismatch"; }
fi
UPLOADED="$(wc -l < "$META/files.txt" | tr -d ' ')"
log "校验通过：$UPLOADED 个文件"

log "备份将被覆盖的文件到 $BACKUP"
mkdir -p "$BACKUP"
: > "$BACKUP/existing.txt"
: > "$BACKUP/added.txt"
: > "$BACKUP/deleted.txt"
while IFS= read -r p; do
  [ -n "$p" ] || continue
  if [ -f "$DATA/$p" ]; then
    printf '%s\n' "$p" >> "$BACKUP/existing.txt"
  else
    printf '%s\n' "$p" >> "$BACKUP/added.txt"
  fi
done < "$META/files.txt"
if [ -s "$META/delete.txt" ]; then
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    if [ -f "$DATA/$p" ]; then
      printf '%s\n' "$p" >> "$BACKUP/existing.txt"
      printf '%s\n' "$p" >> "$BACKUP/deleted.txt"
    fi
  done < "$META/delete.txt"
fi
if [ -s "$BACKUP/existing.txt" ]; then
  tar -czf "$BACKUP/files.tar.gz" -C "$DATA" -T "$BACKUP/existing.txt" || fail "backup failed"
fi
cp -f "$META/files.txt" "$BACKUP/files.txt" 2>/dev/null || true
cp -f "$META/manifest.sha256" "$BACKUP/manifest.sha256" 2>/dev/null || true
MUTATED=1

log "写入分片（index/idMap 留到最后）"
while IFS= read -r p; do
  [ -n "$p" ] || continue
  case "$p" in
    */index.json|*/idMap.json) continue ;;
  esac
  install -D -m 644 "$STAGE/$p" "$DATA/$p" || fail "install $p failed"
done < "$META/files.txt"

log "写入索引 index.json / idMap.json"
while IFS= read -r p; do
  [ -n "$p" ] || continue
  case "$p" in
    */index.json|*/idMap.json)
      install -D -m 644 "$STAGE/$p" "$DATA/$p" || fail "install $p failed"
      ;;
  esac
done < "$META/files.txt"

if [ -s "$META/delete.txt" ]; then
  log "删除远端多出文件"
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    rm -f "$DATA/$p"
  done < "$META/delete.txt"
fi

chmod -R a+rX "$DATA" 2>/dev/null || true

log "健康检查（nginx 静态直读，无需 reload）"
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  BASE="https://$DOMAIN"
  CURL=(curl -k -sS --max-time 20 --connect-timeout 5 --resolve "$DOMAIN:443:127.0.0.1")
else
  BASE="http://127.0.0.1"
  CURL=(curl -sS --max-time 20 --connect-timeout 5 -H "Host: $DOMAIN")
fi

urlencode_path() {
  # 只编码路径字节（中文分片名 -> %E4%B8%8A...），保证 nginx 能正确解码
  local LC_ALL=C s="$1" out="" c esc i
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [a-zA-Z0-9._~/-]) out+="$c" ;;
      *) printf -v esc '%%%02X' "'$c"; out+="$esc" ;;
    esac
  done
  printf '%s' "$out"
}

fetch_code() {
  "${CURL[@]}" -o "$2" -w '%{http_code}' "$1" || true
}

check_file() {
  local path="$1" out="$2" code enc
  enc="$(urlencode_path "$path")"
  code="$(fetch_code "$BASE/data/$enc?v=$STAMP" "$out")"
  [ "$code" = "200" ] || fail "GET /data/$path -> $code"
  [ -s "$out" ] || fail "/data/$path empty"
}

if [ "$CHECK_QUESTIONS" = "1" ]; then
  check_file "questions/index.json" "$TMP/index.json"
  check_file "questions/idMap.json" "$TMP/idMap.json"
  if command -v node >/dev/null 2>&1; then
    node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const n=Object.keys(j).length;if(!n)process.exit(2);console.log("index keys="+n)' "$TMP/index.json" || fail "index.json invalid"
    node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const n=Object.keys(j).length;if(!n)process.exit(2);console.log("idMap entries="+n)' "$TMP/idMap.json" || fail "idMap.json invalid"
  else
    grep -q '"provincial-' "$TMP/index.json" || fail "index.json unexpected"
  fi
fi

while IFS= read -r p; do
  [ -n "$p" ] || continue
  case "$p" in
    questions/*.json)
      name="${p#questions/}"
      case "$name" in
        index.json|idMap.json) continue ;;
      esac
      if [ "$CHECK_QUESTIONS" = "1" ] && [ "$name" != "questions.json" ] && [[ "$name" =~ ^[a-z_]+-.+-[a-z]+-[0-9]+\.json$ ]]; then
        grep -Fq "\"$name\"" "$TMP/index.json" || fail "index.json does not reference $name"
      fi
      enc="$(urlencode_path "$p")"
      code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE/data/$enc?v=$STAMP" || true)"
      [ "$code" = "200" ] || fail "GET /data/$p -> $code"
      ;;
    interview/*.json)
      enc="$(urlencode_path "$p")"
      code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE/data/$enc?v=$STAMP" || true)"
      [ "$code" = "200" ] || fail "GET /data/$p -> $code"
      ;;
  esac
done < "$META/files.txt"

if [ -s "$META/probe.txt" ]; then
  probe_path="$(cut -f1 "$META/probe.txt")"
  probe_id="$(cut -f2 "$META/probe.txt")"
  check_file "$probe_path" "$TMP/probe.json"
  grep -Eq '"isAbnormal"[[:space:]]*:[[:space:]]*true' "$TMP/probe.json" || fail "E10 isAbnormal flag not found in $probe_path"
  if [ -n "$probe_id" ]; then
    grep -Fq "\"$probe_id\"" "$TMP/idMap.json" || fail "idMap missing probe id $probe_id"
  fi
  echo "E10 probe OK: $probe_path ($probe_id)"
fi

log "生成回滚脚本"
{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  printf 'DATA=%q\n' "$DATA"
  printf 'BACKUP=%q\n' "$BACKUP"
  echo 'if [ -f "$BACKUP/files.tar.gz" ]; then tar -xzf "$BACKUP/files.tar.gz" -C "$DATA"; fi'
  echo 'if [ -s "$BACKUP/added.txt" ]; then while IFS= read -r p; do [ -n "$p" ] && rm -f "$DATA/$p"; done < "$BACKUP/added.txt"; fi'
  echo 'chmod -R a+rX "$DATA" 2>/dev/null || true'
  echo 'echo "restored from $BACKUP"'
} > "$BACKUP/rollback.sh"
chmod 755 "$BACKUP/rollback.sh"

log "清理旧备份（保留最近 $KEEP_BACKUPS 份）"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | awk -v keep="$KEEP_BACKUPS" 'NR > keep {print $2}' \
  | while IFS= read -r d; do [ -n "$d" ] && rm -rf "$d"; done

MUTATED=0
rm -rf "$STAGE" "$META" || true
echo ""
echo "data release done"
echo "uploaded: $UPLOADED files"
echo "backup:   $BACKUP"
echo "rollback: bash $BACKUP/rollback.sh"
'@

# .ps1 文件是 CRLF，远端 bash 必须 LF；落盘后 scp 传文件执行，不走 stdin 管道
$remoteScript = $remoteScript.Replace("`r`n", "`n").Replace("`r", "`n")
$remoteDir = "/tmp/bideti-data-$stamp"
$remoteSh = "$remoteDir/apply.sh"
$checkQuestions = if ($Scopes -contains "questions") { "1" } else { "0" }
$remoteScript = $remoteScript.Replace('__REMOTE_DATA__', $RemoteData)
$remoteScript = $remoteScript.Replace('__REMOTE_BACKUP_ROOT__', $RemoteBackupRoot)
$remoteScript = $remoteScript.Replace('__STAMP__', $stamp)
$remoteScript = $remoteScript.Replace('__DOMAIN__', $Domain)
$remoteScript = $remoteScript.Replace('__REMOTE_META__', $remoteDir)
$remoteScript = $remoteScript.Replace('__CHECK_QUESTIONS__', $checkQuestions)

$tmpSh = Join-Path $stageDir "apply.sh"
Write-Utf8NoBom $tmpSh $remoteScript

$bash = "C:\Program Files\Git\bin\bash.exe"
if (Test-Path -LiteralPath $bash) {
    & $bash --noprofile --norc -n ($tmpSh -replace '\\', '/')
    if ($LASTEXITCODE -ne 0) { throw "远端脚本语法检查未通过（bash -n）：$tmpSh" }
    Write-Host "==> 远端脚本已生成并通过 bash -n 语法检查"
} else {
    Write-Host "==> 远端脚本已生成（未找到 Git Bash，跳过 bash -n）"
}

if ($DryRun) {
    Write-Host ""
    Write-Host "==> DryRun：已完成 index 重建、差异比对、打包与脚本生成，跳过上传/写入"
    Write-Host "    暂存目录：$stageDir"
    Write-Host "    上传清单：$filesMetaPath"
    if (-not $Offline) { Write-Host "    线上未做任何改动" }
    return
}

$uploadFiles = @($payloadPath, $filesMetaPath, $manifestPath, $tmpSh)
if (Test-Path -LiteralPath $probePath) { $uploadFiles += $probePath }
if (Test-Path -LiteralPath $deletePath) { $uploadFiles += $deletePath }

Write-Host "==> 远端准备暂存目录 $remoteDir"
& ssh $remote "rm -rf $remoteDir && mkdir -p $remoteDir"
if ($LASTEXITCODE -ne 0) { throw "创建远端暂存目录失败" }

Write-Host "==> 上传 payload + 清单 + 校验脚本"
& scp @uploadFiles "${remote}:$remoteDir/"
if ($LASTEXITCODE -ne 0) { throw "上传发布文件失败" }

Write-Host "==> 远端：解包校验 -> 备份 -> 写入 -> 健康检查（失败自动回滚）"
& ssh $remote "bash $remoteSh; rc=`$?; [ `$rc -eq 0 ] && rm -rf $remoteDir; exit `$rc"
$remoteExit = $LASTEXITCODE

Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue

if ($remoteExit -ne 0) { throw "远端发布/健康检查失败（退出码 $remoteExit），已按备份回滚（临时目录保留：$remoteDir）" }

Write-Host ""
Write-Host "发布成功：$($upload.Count) 个文件已更新到 $RemoteData"
Write-Host "备份目录：$RemoteBackupRoot/$stamp"
Write-Host "手工回滚：ssh $remote `"bash $RemoteBackupRoot/$stamp/rollback.sh`""
Write-Host "提示：nginx 对 /data/ 设置了 1h 缓存，浏览器端 index.json 可能最多滞后 1 小时"

