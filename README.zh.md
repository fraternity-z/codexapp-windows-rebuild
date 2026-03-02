# Codex Windows Repack Toolkit

[English](README.md) | 中文 | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md)

将 `Codex.dmg`（macOS 安装包）转换为 Windows 安装程序（`.exe`）。

默认 DMG 地址：

`https://persistent.oaistatic.com/codex-app-prod/Codex.dmg`

## 功能

- 将 `Codex.dmg` 重封装为 Windows NSIS 安装包
- 优先使用项目根目录下本地 `Codex.dmg`
- 本地文件不存在时自动下载 DMG
- 自动补丁 `appSunset` 强制升级页
- 自动从 `electron.icns` 生成 Windows 图标

## 环境要求

- Windows 10/11 x64
- Node.js 22 + npm
- 如本地原生模块编译失败，请安装 Visual Studio Build Tools（C++ 工具链）

## 使用方法

在项目根目录执行：

1. 安装依赖

```powershell
npm ci
```

2. 默认构建

```powershell
npm run repack
```

3. 指定 DMG 下载地址构建

```powershell
npm run repack -- --dmg-url "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
```

4. 指定本地 DMG 文件构建

```powershell
npm run repack -- --dmg-file "D:\path\Codex.dmg"
```

5. 可选：覆盖 Electron 版本

```powershell
npm run repack -- --dmg-file "D:\path\Codex.dmg" --electron-version "40.0.0"
```

## PowerShell 快捷入口

```powershell
.\run.ps1
.\run.ps1 -DmgUrl "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
.\run.ps1 -DmgFile "D:\path\Codex.dmg"
.\run.ps1 -DmgFile "D:\path\Codex.dmg" -ElectronVersion "40.0.0"
```

## 输出文件

构建产物位于 `release/`：

- `Codex-Setup-<version>.exe`
- `*.blockmap`
- `build-metadata.json`
