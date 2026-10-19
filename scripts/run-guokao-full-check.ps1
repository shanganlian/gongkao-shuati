# Requires PowerShell 5.1+
# 全量 dry-run -> summary.md -> 无官方答案总账
# 全量 dry-run 输出较大，直接重定向到日志文件，避免前台管道缓冲丢输出。
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location (Split-Path -Parent $PSScriptRoot)

$reportDir = Join-Path (Get-Location) 'guokao-reports'
$log = Join-Path $reportDir 'all-dryrun.log'
Remove-Item $log -Force -ErrorAction SilentlyContinue

Write-Host "== 1/3 full dry-run (log: $log) =="
& node scripts/convert-guokao.js --all --dry-run *> $log
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
  Get-Content $log -Tail 80
  Write-Host "full dry-run failed with exit code $exitCode" -ForegroundColor Red
  exit $exitCode
}
Get-Content $log -Tail 20

Write-Host '== 2/3 build summary.md =='
node scripts/report-v2.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '== 3/3 missing-answer ledger =='
node scripts/audit-missing-answers.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Full check completed.'
