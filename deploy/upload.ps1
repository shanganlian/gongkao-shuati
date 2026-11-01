[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Archive,
    [string]$Server = "47.106.172.207",
    [string]$User = "root",
    [string]$RemoteDir = "/root/bideti-deploy"
)

$ErrorActionPreference = "Stop"

foreach ($cmd in @("ssh", "scp")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "未找到 $cmd（Windows 可选功能 OpenSSH Client）"
    }
}

if (-not (Test-Path -LiteralPath $Archive)) {
    throw "发布包不存在：$Archive"
}
$archivePath = (Resolve-Path -LiteralPath $Archive).Path
$shaPath = "$archivePath.sha256"
if (-not (Test-Path -LiteralPath $shaPath)) {
    throw "缺少校验文件：$shaPath；请重新运行 deploy/pack.ps1"
}

$remote = "$User@$Server"

Write-Host "==> 上传部署脚本到 ${remote}:$RemoteDir"
& ssh $remote "rm -rf /root/deploy '$RemoteDir'"
if ($LASTEXITCODE -ne 0) { throw "ssh 连接失败" }

& scp -r $PSScriptRoot "${remote}:/root/"
if ($LASTEXITCODE -ne 0) { throw "上传 deploy 目录失败" }

& ssh $remote "mv /root/deploy '$RemoteDir' && chmod +x '$RemoteDir'/*.sh"
if ($LASTEXITCODE -ne 0) { throw "整理远程 deploy 目录失败" }

Write-Host "==> 上传发布包"
& scp $archivePath $shaPath "${remote}:/tmp/"
if ($LASTEXITCODE -ne 0) { throw "上传发布包失败" }

$remoteArchive = "/tmp/$([System.IO.Path]::GetFileName($archivePath))"
Write-Host ""
Write-Host "上传完成。到服务器执行："
Write-Host "  bash $RemoteDir/00-preflight.sh"
Write-Host "  bash $RemoteDir/02-release.sh $remoteArchive"
Write-Host ""
Write-Host "首次部署顺序见 $RemoteDir/README.md（DNS 必须最后切）。"
