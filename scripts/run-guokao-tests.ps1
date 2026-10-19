# Requires PowerShell 5.1+
# 运行 convert-guokao.js 的回归测试与 2017/2021 验收卷 dry-run
# 注意：convert-guokao.js 每次 dry-run 都会覆盖 summary.json / all-issues.csv，
# 因此这里先备份全量报告产物，结束后恢复，避免回归测试污染全量账本。
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location (Split-Path -Parent $PSScriptRoot)

$reportDir = Join-Path (Get-Location) 'guokao-reports'
$backupDir = Join-Path $reportDir '.tests-backup'
$artifacts = @('summary.json', 'all-issues.csv', 'summary.md')

function Backup-Reports {
  if (Test-Path $backupDir) { Remove-Item $backupDir -Recurse -Force }
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  foreach ($name in $artifacts) {
    $src = Join-Path $reportDir $name
    if (Test-Path $src) { Copy-Item $src (Join-Path $backupDir $name) -Force }
  }
}

function Restore-Reports {
  if (-not (Test-Path $backupDir)) { return }
  foreach ($name in $artifacts) {
    $src = Join-Path $backupDir $name
    if (Test-Path $src) { Copy-Item $src (Join-Path $reportDir $name) -Force }
  }
  Remove-Item $backupDir -Recurse -Force
}

Backup-Reports
$exitCode = 0
try {
  Write-Host '== 1/3 regression tests =='
  node scripts/test-convert-guokao.js
  if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }

  if ($exitCode -eq 0) {
    Write-Host '== 2/3 2017 dry-run =='
    node scripts/convert-guokao.js --year 2017 --dry-run
    if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
  }

  if ($exitCode -eq 0) {
    Write-Host '== 3/3 2021 dry-run =='
    node scripts/convert-guokao.js --year 2021 --dry-run
    if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
  }
} finally {
  Restore-Reports
}

if ($exitCode -ne 0) { exit $exitCode }
Write-Host 'All checks completed.'
