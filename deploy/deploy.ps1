# 一键部署：按工作区改动自动选通道（full / frontend / data），发布的就是「当前工作区」
# 用法：
#   npm run deploy                                                     # 等价于 -Mode auto
#   powershell -ExecutionPolicy Bypass -File deploy/deploy.ps1 -DryRun  # 只构建/自检，不传输
#   powershell -ExecutionPolicy Bypass -File deploy/deploy.ps1 -Mode frontend -DryRun
#   powershell -ExecutionPolicy Bypass -File deploy/deploy.ps1 -Mode auto -SkipChecks
#   powershell -ExecutionPolicy Bypass -File deploy/deploy.ps1 -Mode full
#
# 三条硬约定（只做编排，不改变原有发布方式）：
#   1) 不会自动 git commit / git push —— 提交由人决定，脚本只负责把工作区发上去；
#   2) 远端 /tmp/bideti-deploy.lock 串行化部署，超过 -LockTtlMinutes（默认 30）视为陈旧锁自动接管；
#   3) 每次前端发布前把线上 index.html 备份到 /root/index-<stamp>.html，只保留最近 -KeepIndexBackups（默认 5）份。
#
# 通道说明：
#   full     整包发布（pack.ps1 -> upload.ps1 -> 02-release.sh），会连同 dist/data 一起传，重且慢；
#            只有 server.ts / shared/ / netlify/ / package*.json / tsconfig.json 这类服务端改动才需要。
#   frontend 只传 dist/assets + dist/index.html（不传题库、不重启 API），UI 改动走这个。
#   data     只同步 public/data 的变化分片（不传前端、不 reload nginx）。
#
# 参数透传：-Mode 之外的服务端参数（-Server/-User/-RemoteDist/-Domain）会原样传给子脚本。
[CmdletBinding()]
param(
    [ValidateSet('auto', 'full', 'frontend', 'data')]
    [string]$Mode = 'auto',
    [switch]$DryRun,
    [switch]$SkipChecks,
    [string]$Server = '47.106.172.207',
    [string]$User = 'root',
    [string]$RemoteDist = '/var/www/bideti/current/dist',
    [string]$Domain = 'igoiget.com',
    [int]$KeepIndexBackups = 5,
    [int]$LockTtlMinutes = 30
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$remote = "$User@$Server"
$remoteDeployDir = '/root/bideti-deploy'
$lockPath = '/tmp/bideti-deploy.lock'

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host "==> $Text" -ForegroundColor Cyan
    [Console]::Out.Flush()
}

function Write-Note([string]$Text) {
    Write-Host "    $Text"
    [Console]::Out.Flush()
}

# git status 会把非 ASCII 路径写成 "public/data/\345\256\211..." 形式的八进制转义，
# 这里还原成中文，日志里才看得出改的是哪些省份题库。
function ConvertFrom-GitQuotedPath([string]$Path) {
    if ($Path -notmatch '\\[0-7]{3}') {
        return $Path.Replace('\"', '"')
    }
    $bytes = New-Object System.Collections.Generic.List[byte]
    $i = 0
    while ($i -lt $Path.Length) {
        if ([int]$Path[$i] -eq 92 -and ($i + 3) -lt $Path.Length -and $Path.Substring($i + 1, 3) -match '^[0-7]{3}$') {
            $bytes.Add([Convert]::ToByte($Path.Substring($i + 1, 3), 8))
            $i += 4
        } elseif ([int]$Path[$i] -eq 92 -and ($i + 1) -lt $Path.Length) {
            $next = $Path[$i + 1]
            if ($next -eq 't') { $bytes.Add(9) } else { $bytes.Add([byte][char]$next) }
            $i += 2
        } else {
            $bytes.Add([byte][char]$Path[$i])
            $i += 1
        }
    }
    return [System.Text.Encoding]::UTF8.GetString($bytes.ToArray())
}

function Assert-LastExit([string]$What) {
    if ($LASTEXITCODE -ne 0) {
        throw "$What 失败（退出码 $LASTEXITCODE）"
    }
}

# 把工作区文件归到发布通道；返回 backend / data / frontend / tooling / other
function Get-ChannelOfPath([string]$Path) {
    $p = $Path.Replace('\', '/')
    if ($p -match '^server\.ts$' -or
        $p -match '^shared/' -or
        $p -match '^netlify/' -or
        $p -match '^package(-lock)?\.json$' -or
        $p -match '^tsconfig\.json$' -or
        $p -match '^vite\.config\.ts$' -or
        $p -match '^postcss\.config\.' -or
        $p -match '^\.nvmrc$' -or
        $p -match '^\.gitattributes$') {
        return 'backend'
    }
    if ($p -match '^public/data/') {
        return 'data'
    }
    if ($p -match '^index\.html$' -or
        $p -match '^src/' -or
        $p -match '^public/' -or
        $p -match '^scripts/build-submodule-counts\.cjs$') {
        return 'frontend'
    }
    if ($p -match '^deploy/') {
        return 'tooling'
    }
    return 'other'
}

# 环境检查
foreach ($cmd in @('node', 'git')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "未找到 $cmd"
    }
}
if (-not $DryRun) {
    foreach ($cmd in @('ssh', 'scp')) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            throw "未找到 $cmd（Windows 可选功能 OpenSSH Client）"
        }
    }
}

# ============================================
# 1. 读工作区改动，决定发什么
# ============================================
Write-Step '读取工作区改动（git status --porcelain -uall）'
$statusLines = @(git status --porcelain -uall)
Assert-LastExit 'git status'

$changed = @()
foreach ($line in $statusLines) {
    $t = $line.TrimEnd()
    if ($t.Length -le 3) { continue }
    $path = $t.Substring(3).Trim()
    if ($path -match ' -> ') { $path = ($path -split ' -> ')[-1] }
    $path = (ConvertFrom-GitQuotedPath $path.Trim('"')).Trim('"')
    if ($path) { $changed += $path }
}
$changed = @($changed | Select-Object -Unique)

# 密钥文件绝不允许进发布流程（deploy 的 pack 已排除，这里是第二道闸）
# 例外：.env.example 是模板（无真实密钥），允许出现在改动里
$envLeak = @($changed | Where-Object {
    $n = $_.Replace('\', '/')
    ($n -match '(^|/)\.env') -and ($n -notmatch '\.env\.example$')
})
if ($envLeak.Count -gt 0) {
    throw "工作区改动里有 .env 文件：$($envLeak -join ', ')；密钥不进发布包，已中止"
}

$kinds = @($changed | ForEach-Object { Get-ChannelOfPath $_ } | Sort-Object -Unique)
$resolved = @()
switch ($Mode) {
    'full' { $resolved = @('full') }
    'frontend' { $resolved = @('frontend') }
    'data' { $resolved = @('data') }
    default {
        if ($kinds -contains 'backend') {
            $resolved = @('full')
        } else {
            if ($kinds -contains 'frontend') { $resolved += 'frontend' }
            if ($kinds -contains 'data') { $resolved += 'data' }
        }
    }
}

if ($changed.Count -eq 0) {
    Write-Note '工作区没有改动'
} else {
    Write-Note "改动文件 $($changed.Count) 个："
    ($changed | Select-Object -First 40) | ForEach-Object { Write-Note ("  [{0}] {1}" -f (Get-ChannelOfPath $_), $_) }
    if ($changed.Count -gt 40) { Write-Note "  …… 省略 $($changed.Count - 40) 个" }
}

# ============================================
# 2. 发布前检查
# ============================================
if ($SkipChecks) {
    Write-Step '跳过发布前检查（-SkipChecks）'
} else {
    Write-Step '类型检查：npm run lint（tsc --noEmit）'
    & cmd.exe /c 'npm.cmd run lint'
    Assert-LastExit '类型检查'
    Write-Note 'OK'
}

# ============================================
# 3. 通道实现（全部委托给已有的 deploy/*.ps1）
# ============================================
function Invoke-ChildScript([string]$Script, [string[]]$ExtraArgs) {
    $psArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $Script) + $ExtraArgs
    & powershell @psArgs
    Assert-LastExit $Script
}

function Publish-Frontend {
    if (-not $DryRun) {
        Write-Step "备份线上 index.html -> /root/index-$stamp.html（保留最近 $KeepIndexBackups 份）"
        $backupCmd = 'set -e; B="/root/index-__STAMP__.html"; cp -a "__DIST__/index.html" "$B"; chmod 644 "$B"; ls -1t /root/index-*.html 2>/dev/null | tail -n +__PRUNE__ | xargs -r rm -f; echo "backup: $B"; ls -1t /root/index-*.html 2>/dev/null | head -n __KEEP__'
        $backupCmd = $backupCmd.Replace('__STAMP__', $stamp).Replace('__DIST__', $RemoteDist)
        $backupCmd = $backupCmd.Replace('__PRUNE__', "$($KeepIndexBackups + 1)").Replace('__KEEP__', "$KeepIndexBackups")
        & ssh $remote $backupCmd
        Assert-LastExit '备份线上 index.html'
    }
    Write-Step '发布前端（dist/assets + dist/index.html，不传题库、不重启 API）'
    $extra = @('-Server', $Server, '-User', $User, '-RemoteDist', $RemoteDist, '-Domain', $Domain)
    if ($DryRun) { $extra += '-DryRun' }
    Invoke-ChildScript 'deploy/release-frontend.ps1' $extra
}

function Publish-Data {
    Write-Step '同步题库数据（只传变化分片）'
    $extra = @('-Server', $Server, '-User', $User, '-RemoteData', "$RemoteDist/data", '-Domain', $Domain)
    if ($DryRun) { $extra += '-DryRun' }
    Invoke-ChildScript 'deploy/release-data.ps1' $extra
}

function Publish-Full {
    Write-Step '整包发布：pack（npm ci + build + tar）'
    if ($DryRun) {
        Invoke-ChildScript 'deploy/pack.ps1' @('-SkipInstall')
    } else {
        Invoke-ChildScript 'deploy/pack.ps1' @()
    }
    $archive = Get-ChildItem -LiteralPath $repoRoot -Filter 'bideti-release-*.tar.gz' |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $archive) { throw '没有找到发布包 bideti-release-*.tar.gz' }
    Write-Note "发布包：$($archive.Name)"

    if ($DryRun) {
        Write-Note 'DryRun：跳过上传，真实发布命令为：'
        Write-Note "  powershell -ExecutionPolicy Bypass -File deploy/upload.ps1 -Archive `"$($archive.FullName)`""
        Write-Note "  ssh $remote `"bash $remoteDeployDir/02-release.sh /tmp/$($archive.Name)`""
        return
    }

    Write-Step '上传发布包与部署脚本'
    Invoke-ChildScript 'deploy/upload.ps1' @('-Archive', $archive.FullName, '-Server', $Server, '-User', $User)
    Write-Step '远端 02-release.sh（解包 -> npm ci --omit=dev -> 切 current -> 重启 pm2）'
    & ssh $remote "bash $remoteDeployDir/02-release.sh /tmp/$($archive.Name)"
    Assert-LastExit '远端 02-release.sh'
}

# ============================================
# 4. 线上自检
# ============================================
function Test-LiveSite {
    Write-Step "线上自检 https://$Domain"
    if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
        Write-Note '未找到 curl.exe，跳过 HTTP 自检'
        return
    }
    # 变量名不要叫 $home：PowerShell 变量名大小写不敏感，$home 就是只读自动变量 $HOME，
    # 赋值会抛 VariableNotWritable（无法覆盖变量 HOME）；这里用脚本局部变量 $homeStatus。
    $homeStatus = (& curl.exe -sS -o NUL -w '%{http_code}' "https://$Domain/").Trim()
    Write-Note "首页 HTTP=$homeStatus（期望 200）"
    if ($homeStatus -ne '200') { throw "首页不是 200（$homeStatus）" }

    # 注意：& curl.exe 输出是「按行拆开的数组」，直接对数组用 -notmatch 会变成过滤（返回不匹配的行），
    # 多行 HTML 必然被判成「缺少 #root」。先 -join 成单个字符串再做整体匹配。
    $html = (& curl.exe -sS "https://$Domain/") -join "`n"
    if ($html -notmatch '<div id="root">') { throw '首页缺少 #root 节点' }
    Write-Note '首页含 #root：OK'

    $api = (& curl.exe -sS -o NUL -w '%{http_code}' "https://$Domain/api/stats/overview").Trim()
    Write-Note "/api/stats/overview HTTP=$api（期望 401，说明后端在线）"
    if ($api -ne '401') { Write-Note '警告：后端未返回 401，请检查 pm2 与 nginx 反代' }

    $qq = (& curl.exe -sS -o NUL -w '%{http_code}' "https://$Domain/api/auth/qq/callback").Trim()
    Write-Note "/api/auth/qq/callback HTTP=$qq（QQ 开关默认关闭，期望 404）"
    if ($qq -ne '404') { Write-Note '警告：QQ 登录接口未按预期返回 404，检查 QQ_LOGIN_ENABLED' }
}

# ============================================
# 5. 加锁 -> 逐通道发布 -> 释放锁
# ============================================
$lockAcquired = $false
try {
    if (-not $DryRun) {
        Write-Step "远端加锁 $lockPath"
        $ttl = $LockTtlMinutes * 60
        $lockCmd = 'L=__LOCK__; TTL=__TTL__; if [ -f "$L" ]; then A=$(( $(date +%s) - $(stat -c %Y "$L") )); if [ "$A" -lt "$TTL" ]; then echo "LOCKED ${A}s holder: $(cat "$L")"; exit 9; else echo "STALE ${A}s, taking over"; fi; fi; printf "%s %s %s\n" "__STAMP__" "__MODE__" "__WHO__" > "$L"; echo "LOCK OK"'
        $lockCmd = $lockCmd.Replace('__LOCK__', $lockPath).Replace('__TTL__', "$ttl").Replace('__STAMP__', $stamp)
        $lockCmd = $lockCmd.Replace('__MODE__', $Mode).Replace('__WHO__', "$env:USERNAME@$env:COMPUTERNAME")
        & ssh $remote $lockCmd
        if ($LASTEXITCODE -eq 9) {
            throw "另一个部署正在进行（$lockPath）；确认没有部署进程后手工删除该锁文件再重试"
        }
        Assert-LastExit '远端加锁'
        $lockAcquired = $true
    }

    foreach ($channel in $resolved) {
        switch ($channel) {
            'frontend' { Publish-Frontend }
            'data' { Publish-Data }
            'full' { Publish-Full }
        }
    }

    if (-not $DryRun) {
        Test-LiveSite
    }
} finally {
    if ($lockAcquired) {
        & ssh $remote "rm -f $lockPath" | Out-Null
        Write-Note '已释放远端锁'
    }
}

# ============================================
# 6. 结果与回滚提示
# ============================================
Write-Step '完成'
Write-Note "通道：$($resolved -join ' + ')；时间戳：$stamp"
if ($DryRun) {
    Write-Note 'DryRun 结束：线上没有任何改动'
} else {
    Write-Note '回滚方式：'
    if ($resolved -contains 'frontend') {
        Write-Note "  前端：ssh $remote `"cp -a /root/index-$stamp.html $RemoteDist/index.html && nginx -t && systemctl reload nginx`""
    }
    if ($resolved -contains 'data') {
        Write-Note "  题库：ssh $remote `"bash /var/www/bideti/data-backups/<stamp>/rollback.sh`""
    }
    if ($resolved -contains 'full') {
        Write-Note "  整包：ssh $remote `"bash $remoteDeployDir/03-rollback.sh`""
    }
    Write-Note '提醒：脚本不会自动提交代码，记得自己 git commit。'
}


if ($resolved.Count -eq 0) {
    Write-Step '没有需要发布的改动（只有文档/脚本等非线上文件）'
    Write-Note '如需强制发布，用 -Mode frontend / -Mode data / -Mode full'
    return
}

Write-Step "发布通道：$($resolved -join ' + ')（-Mode $Mode）"
if ($resolved -contains 'full') {
    Write-Note '警告：full 通道会打包 dist/data（约 634MB），耗时较长'
}
if ($DryRun) {
    Write-Note 'DryRun：只做构建/自检/脚本生成，不上传、不加锁、不改线上'
}
