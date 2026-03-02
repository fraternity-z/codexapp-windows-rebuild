# Codex Windows Repack Toolkit

[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md) | 한국어 | [Español](README.es.md)

`Codex.dmg`(macOS 패키지)를 Windows 설치 프로그램(`.exe`)으로 변환합니다.

기본 DMG URL:

`https://persistent.oaistatic.com/codex-app-prod/Codex.dmg`

## 주요 기능

- `Codex.dmg`를 Windows NSIS 설치 프로그램으로 재패키징
- 프로젝트 루트에 `Codex.dmg`가 있으면 우선 사용
- 로컬 파일이 없으면 DMG 자동 다운로드
- `appSunset` 강제 업데이트 화면 자동 패치
- `electron.icns`에서 Windows 아이콘 자동 생성

## 요구 사항

- Windows 10/11 x64
- Node.js 22 + npm
- 네이티브 모듈 컴파일 실패 시 Visual Studio Build Tools(C++ 툴체인) 설치

## 사용 방법

프로젝트 루트에서 실행:

1. 의존성 설치

```powershell
npm ci
```

2. 기본 빌드

```powershell
npm run repack
```

3. DMG URL 지정 빌드

```powershell
npm run repack -- --dmg-url "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
```

4. 로컬 DMG 파일 지정 빌드

```powershell
npm run repack -- --dmg-file "D:\path\Codex.dmg"
```

5. 선택: Electron 버전 덮어쓰기

```powershell
npm run repack -- --dmg-file "D:\path\Codex.dmg" --electron-version "40.0.0"
```

## PowerShell 바로가기

```powershell
.\run.ps1
.\run.ps1 -DmgUrl "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
.\run.ps1 -DmgFile "D:\path\Codex.dmg"
.\run.ps1 -DmgFile "D:\path\Codex.dmg" -ElectronVersion "40.0.0"
```

## 출력

`release/`에 생성됩니다:

- `Codex-Setup-<version>.exe`
- `*.blockmap`
- `build-metadata.json`
