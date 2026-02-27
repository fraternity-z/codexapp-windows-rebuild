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

npm run repack -- $args
