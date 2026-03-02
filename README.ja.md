# Codex Windows Repack Toolkit

[English](README.md) | [中文](README.zh.md) | 日本語 | [한국어](README.ko.md) | [Español](README.es.md)

`Codex.dmg`（macOS パッケージ）を Windows インストーラー（`.exe`）に変換します。

既定の DMG URL:

`https://persistent.oaistatic.com/codex-app-prod/Codex.dmg`

## 主な機能

- `Codex.dmg` を Windows NSIS インストーラーとして再パッケージ
- プロジェクトルートに `Codex.dmg` がある場合は優先利用
- ローカルにない場合は DMG を自動ダウンロード
- `appSunset` の強制アップグレード画面を自動パッチ
- `electron.icns` から Windows アイコンを自動生成

## 必要環境

- Windows 10/11 x64
- Node.js 22 + npm
- ネイティブモジュールのビルドに失敗する場合は Visual Studio Build Tools（C++ ツールチェーン）

## 使い方

プロジェクトルートで実行:

1. 依存関係をインストール

```powershell
npm ci
```

2. デフォルトビルド

```powershell
npm run repack
```

3. DMG URL を指定してビルド

```powershell
npm run repack -- --dmg-url "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
```

4. ローカル DMG を指定してビルド

```powershell
npm run repack -- --dmg-file "D:\path\Codex.dmg"
```

5. 任意: Electron バージョンを上書き

```powershell
npm run repack -- --dmg-file "D:\path\Codex.dmg" --electron-version "40.0.0"
```

## PowerShell ショートカット

```powershell
.\run.ps1
.\run.ps1 -DmgUrl "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
.\run.ps1 -DmgFile "D:\path\Codex.dmg"
.\run.ps1 -DmgFile "D:\path\Codex.dmg" -ElectronVersion "40.0.0"
```

## 出力

`release/` に生成されます:

- `Codex-Setup-<version>.exe`
- `*.blockmap`
- `build-metadata.json`
