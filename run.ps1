param(
  [string]$DmgUrl = "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg",
  [string]$DmgFile = "",
  [string]$ElectronVersion = ""
)

$args = @()
$defaultLocalDmg = Join-Path $PSScriptRoot "Codex.dmg"
if ($DmgFile) {
  $args += @("--dmg-file", $DmgFile)
} elseif (Test-Path $defaultLocalDmg) {
  $args += @("--dmg-file", $defaultLocalDmg)
} else {
  $args += @("--dmg-url", $DmgUrl)
}

if ($ElectronVersion) {
  $args += @("--electron-version", $ElectronVersion)
}

$exitCode = 0
try {
  npm run repack -- @args
  if ($LASTEXITCODE -ne 0) {
    $exitCode = $LASTEXITCODE
  }
} catch {
  Write-Host "执行失败: $($_.Exception.Message)" -ForegroundColor Red
  $exitCode = 1
} finally {
  if ($exitCode -eq 0) {
    Write-Host "构建流程已完成。" -ForegroundColor Green
  } else {
    Write-Host "构建流程失败，退出码: $exitCode" -ForegroundColor Red
  }
  Read-Host "按回车键关闭窗口"
}

exit $exitCode
