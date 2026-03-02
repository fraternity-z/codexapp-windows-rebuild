# Codex Windows Repack Toolkit

English | [中文](README.zh.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md)

Convert `Codex.dmg` (macOS package) into a Windows installer (`.exe`).

Default DMG URL:

`https://persistent.oaistatic.com/codex-app-prod/Codex.dmg`

## Features

- Repack `Codex.dmg` into a Windows NSIS installer
- Auto-use local `Codex.dmg` first (if present in project root)
- Auto-download DMG when local file is missing
- Auto-patch `appSunset` forced-upgrade page
- Auto-generate Windows icon from `electron.icns`

## Requirements

- Windows 10/11 x64
- Node.js 22 + npm
- Visual Studio Build Tools (C++ toolchain) if native module compilation fails locally

## Usage

Run in project root:

1. Install dependencies

```powershell
npm ci
```

2. Default build

```powershell
npm run repack
```

3. Build with custom DMG URL

```powershell
npm run repack -- --dmg-url "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
```

4. Build with local DMG file

```powershell
npm run repack -- --dmg-file "D:\path\Codex.dmg"
```

5. Optional: override Electron version

```powershell
npm run repack -- --dmg-file "D:\path\Codex.dmg" --electron-version "40.0.0"
```

## PowerShell Shortcut

```powershell
.\run.ps1
.\run.ps1 -DmgUrl "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
.\run.ps1 -DmgFile "D:\path\Codex.dmg"
.\run.ps1 -DmgFile "D:\path\Codex.dmg" -ElectronVersion "40.0.0"
```

## Output

Files are generated in `release/`:

- `Codex-Setup-<version>.exe`
- `*.blockmap`
- `build-metadata.json`
