# Codex Windows Repack Toolkit

[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | Español

Convierte `Codex.dmg` (paquete de macOS) en un instalador de Windows (`.exe`).

URL DMG predeterminada:

`https://persistent.oaistatic.com/codex-app-prod/Codex.dmg`

## Funciones

- Reempaqueta `Codex.dmg` como instalador Windows NSIS
- Usa primero `Codex.dmg` local si existe en la raíz del proyecto
- Descarga automáticamente el DMG si no existe archivo local
- Aplica parche automático para desactivar la pantalla de actualización forzada `appSunset`
- Genera automáticamente el icono de Windows desde `electron.icns`

## Requisitos

- Windows 10/11 x64
- Node.js 22 + npm
- Instalar Visual Studio Build Tools (toolchain C++) si falla la compilación de módulos nativos

## Uso

Ejecuta en la raíz del proyecto:

1. Instalar dependencias

```powershell
npm ci
```

2. Compilación predeterminada

```powershell
npm run repack
```

3. Compilar con URL DMG personalizada

```powershell
npm run repack -- --dmg-url "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
```

4. Compilar con archivo DMG local

```powershell
npm run repack -- --dmg-file "D:\path\Codex.dmg"
```

5. Opcional: sobrescribir versión de Electron

```powershell
npm run repack -- --dmg-file "D:\path\Codex.dmg" --electron-version "40.0.0"
```

## Atajo de PowerShell

```powershell
.\run.ps1
.\run.ps1 -DmgUrl "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
.\run.ps1 -DmgFile "D:\path\Codex.dmg"
.\run.ps1 -DmgFile "D:\path\Codex.dmg" -ElectronVersion "40.0.0"
```

## Salida

Se generan en `release/`:

- `Codex-Setup-<version>.exe`
- `*.blockmap`
- `build-metadata.json`
