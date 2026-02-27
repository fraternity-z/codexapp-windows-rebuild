# Codex Windows Repack Toolkit

用于把 `Codex.dmg`（macOS 已打包产物）重封装为 Windows 可安装程序（NSIS `.exe`）。

默认 DMG 下载链接：

`https://persistent.oaistatic.com/codex-app-prod/Codex.dmg`

## 目录结构

```text
codexapp-windows-rebuild/
  .github/workflows/repack-windows.yml
  scripts/repack.mjs
  scripts/helpers.mjs
  run.ps1
  package.json
  Codex.dmg                 # 本地默认 DMG 放置位置
  release/                  # 构建输出目录
  work/                     # 临时目录（每次构建会清空）
```

## 前置要求

- Windows 10/11 x64
- Node.js 22（建议 LTS）和 npm
- 本地编译原生模块失败时，安装 Visual Studio Build Tools（C++ 工具链）
- 若使用 GitHub Actions 发布 Release，仓库需允许 workflow 写入 `contents`

## 本地构建

在 `codexapp-windows-rebuild` 目录执行。

1. 安装依赖

```powershell
npm ci
```

2. 默认构建

```powershell
npm run repack
```

默认行为：

- 如果项目根目录存在 `Codex.dmg`，优先使用该文件
- 如果不存在，则从默认链接下载 DMG
- 构建时会自动打补丁，禁用 `appSunset` 强制升级页（避免启动即提示必须更新）

3. 指定 DMG 下载地址

```powershell
npm run repack -- --dmg-url "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
```

4. 指定本地 DMG 文件

```powershell
npm run repack -- --dmg-file "D:\path\Codex.dmg"
```

5. 可选：覆盖 Electron 版本

```powershell
npm run repack -- --dmg-file "D:\path\Codex.dmg" --electron-version "40.0.0"
```

6. PowerShell 入口脚本

```powershell
.\run.ps1
.\run.ps1 -DmgUrl "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
.\run.ps1 -DmgFile "D:\path\Codex.dmg"
.\run.ps1 -DmgFile "D:\path\Codex.dmg" -ElectronVersion "40.0.0"
```

`.\run.ps1` 默认也会优先使用当前目录下的 `Codex.dmg`。

## 输出说明

构建完成后输出在 `release/`：

- `Codex-Setup-<version>.exe`：Windows 安装包
- `*.blockmap`：electron-builder 生成的增量更新文件
- `build-metadata.json`：构建元数据，包含：
  - `version`
  - `electronVersion`
  - `sourceDmgUrl`
  - `sourceDmgFile`
  - `installerFile`
  - `installerName`
  - `sha256`
  - `sunsetPatchApplied`
  - `sunsetPatchedFile`

## GitHub Actions 自动构建/发布

工作流文件：`.github/workflows/repack-windows.yml`

### 触发方式

1. 打开 GitHub 仓库的 `Actions`
2. 选择 `Repack Codex Windows`
3. 点击 `Run workflow`
4. 填写参数

参数：

- `dmg_url`：DMG 下载地址
- `publish_release`：`true` 时自动发布 GitHub Release
- `tag_name`：可选；留空时自动生成 `codex-win-v<version>`

### 产物位置

- Actions Artifact：`.exe`、`.blockmap`、`build-metadata.json`
- `publish_release=true` 时，以上文件会附加到 GitHub Release

## 路径注意事项

当前 workflow 已支持自动识别两种仓库结构：

- 仓库根目录就是工具目录内容（`package.json` 在仓库根）
- 仓库根目录下有 `codexapp-windows-rebuild/` 子目录

不需要再手动改 `working-directory`。
