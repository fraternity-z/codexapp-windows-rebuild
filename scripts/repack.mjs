import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fse from "fs-extra";

import {
  downloadFile,
  extractResourcesFromDmg,
  findFileByName,
  normalizeSemver,
  parseArgs,
  run,
  sha256File,
  writeJson,
} from "./helpers.mjs";

const require = createRequire(import.meta.url);
const asar = require("@electron/asar");
const { path7z } = require("7zip-bin-full");
const { Icns } = require("@fiahfy/icns");
const toIco = require("to-ico");

const DEFAULT_ELECTRON_VERSION = "40.0.0";
const DEFAULT_NODE_PTY_VERSION = "^1.1.0";
const DEFAULT_SQLITE_VERSION = "^12.4.6";
const ELECTRON_HEADERS_URL = "https://electronjs.org/headers";
const DEFAULT_LOCAL_DMG = "Codex.dmg";
const SUNSET_GUARD_BEFORE = "const s=Xs(i);if(r){";
const SUNSET_GUARD_AFTER = "const s=!1;if(r){";
const WINDOWS_ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function prepareNativeModules(nativeDir, versions) {
  await fse.emptyDir(nativeDir);
  await writeJson(path.join(nativeDir, "package.json"), {
    name: "native-rebuild",
    private: true,
    version: "1.0.0",
    dependencies: {
      "node-pty": versions.nodePtyVersion,
      "better-sqlite3": versions.sqliteVersion,
    },
  });
  const env = {
    ...process.env,
    npm_config_runtime: "electron",
    npm_config_target: versions.electronVersion,
    npm_config_disturl: ELECTRON_HEADERS_URL,
  };
  await run("npm", ["install", "--no-audit", "--no-fund"], { cwd: nativeDir, env });
}

function buildRuntimePackage(sourcePkg, versions) {
  return {
    name: sourcePkg.name ?? "openai-codex-electron",
    productName: sourcePkg.productName ?? "Codex",
    version: sourcePkg.version ?? "0.0.0",
    description: sourcePkg.description ?? "Codex",
    main: sourcePkg.main ?? ".vite/build/main.js",
    author: sourcePkg.author ?? "OpenAI",
    license: "UNLICENSED",
    dependencies: {
      "better-sqlite3": versions.sqliteVersion,
      "node-pty": versions.nodePtyVersion,
      bindings: "1.5.0",
      "file-uri-to-path": "1.0.0",
      "node-addon-api": "8.5.0",
    },
  };
}

async function disableSunsetUpgradeGate(winSourceDir) {
  const assetsDir = path.join(winSourceDir, "webview", "assets");
  const names = await fs.readdir(assetsDir);
  const indexFiles = names.filter((name) => /^index-.*\.js$/i.test(name)).sort();
  if (indexFiles.length === 0) {
    throw new Error(`No webview index bundle found in ${assetsDir}`);
  }

  for (const fileName of indexFiles) {
    const indexPath = path.join(assetsDir, fileName);
    const content = await fs.readFile(indexPath, "utf8");
    if (!content.includes("appSunset.title")) {
      continue;
    }
    const hitCount = content.split(SUNSET_GUARD_BEFORE).length - 1;
    if (hitCount !== 1) {
      throw new Error(`Unexpected sunset guard count (${hitCount}) in ${indexPath}`);
    }
    const patched = content.replace(SUNSET_GUARD_BEFORE, SUNSET_GUARD_AFTER);
    await fs.writeFile(indexPath, patched, "utf8");
    return { indexPath, hitCount };
  }

  throw new Error(`Sunset marker not found in index bundle files under ${assetsDir}`);
}

async function prepareWinSource(paths, sourcePkg, versions) {
  await fse.emptyDir(paths.winSource);
  await fse.copy(paths.appUnpacked, paths.winSource);
  const nodePtyTarget = path.join(paths.winSource, "node_modules", "node-pty");
  const sqliteTarget = path.join(paths.winSource, "node_modules", "better-sqlite3");
  if (!(await fse.pathExists(nodePtyTarget)) || !(await fse.pathExists(sqliteTarget))) {
    throw new Error("Missing node-pty or better-sqlite3 in extracted app.asar content.");
  }
  await fse.remove(nodePtyTarget);
  await fse.remove(sqliteTarget);
  await fse.copy(path.join(paths.nativeDir, "node_modules", "node-pty"), nodePtyTarget);
  await fse.copy(path.join(paths.nativeDir, "node_modules", "better-sqlite3"), sqliteTarget);
  const runtimePackage = buildRuntimePackage(sourcePkg, versions);
  await writeJson(path.join(paths.winSource, "package.json"), runtimePackage);
  const sunsetPatch = await disableSunsetUpgradeGate(paths.winSource);
  return { runtimePackage, sunsetPatch };
}

async function prepareBinaries(toolkitRoot, resourcesRoot, winBinariesDir, winExtraDir) {
  await fse.emptyDir(winBinariesDir);
  await fse.emptyDir(winExtraDir);
  const codexPkgRoot = path.join(toolkitRoot, "node_modules", "@openai", "codex-win32-x64");
  const codexExePath = await findFileByName(codexPkgRoot, "codex.exe");
  const rgExePath = await findFileByName(codexPkgRoot, "rg.exe");
  if (!codexExePath || !rgExePath) {
    throw new Error("Failed to locate codex.exe or rg.exe from @openai/codex-win32-x64.");
  }
  await fse.copy(codexExePath, path.join(winBinariesDir, "codex.exe"));
  await fse.copy(rgExePath, path.join(winBinariesDir, "rg.exe"));
  const noticeFile = path.join(resourcesRoot, "THIRD_PARTY_NOTICES.txt");
  const soundFile = path.join(resourcesRoot, "notification.wav");
  if (!(await fse.pathExists(noticeFile)) || !(await fse.pathExists(soundFile))) {
    throw new Error("Missing THIRD_PARTY_NOTICES.txt or notification.wav in DMG resources.");
  }
  await fse.copy(noticeFile, path.join(winExtraDir, "THIRD_PARTY_NOTICES.txt"));
  await fse.copy(soundFile, path.join(winExtraDir, "notification.wav"));
  const iconPath = await createWindowsIconFromResources(resourcesRoot, winExtraDir);
  return { iconPath };
}

function isPngBuffer(value) {
  if (!Buffer.isBuffer(value) || value.length < 8) {
    return false;
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return value.subarray(0, 8).equals(signature);
}

async function createWindowsIconFromResources(resourcesRoot, winExtraDir) {
  const icnsPath = path.join(resourcesRoot, "electron.icns");
  if (!(await fse.pathExists(icnsPath))) {
    throw new Error(`Missing electron.icns in resources: ${icnsPath}`);
  }
  const icns = Icns.from(await fs.readFile(icnsPath));
  const pngBuffers = icns.images.map((entry) => entry.image).filter((entry) => isPngBuffer(entry));
  if (pngBuffers.length === 0) {
    throw new Error(`No PNG icon frames found in ${icnsPath}`);
  }
  pngBuffers.sort((left, right) => right.length - left.length);
  const icoBuffer = await toIco([pngBuffers[0]], { resize: true, sizes: WINDOWS_ICON_SIZES });
  const iconPath = path.join(winExtraDir, "app.ico");
  await fs.writeFile(iconPath, icoBuffer);
  return iconPath;
}

function createBuilderConfig(paths, appVersion, iconPath) {
  return {
    appId: "com.openai.codex",
    productName: "Codex",
    directories: { app: paths.winSource, output: paths.releaseDir, buildResources: paths.winExtra },
    icon: iconPath,
    files: ["**/*"],
    asar: true,
    asarUnpack: [
      "**/*.node",
      "node_modules/node-pty/prebuilds/**",
      "node_modules/node-pty/build/**",
      "node_modules/better-sqlite3/build/**",
    ],
    npmRebuild: false,
    nodeGypRebuild: false,
    buildDependenciesFromSource: false,
    extraResources: [
      { from: path.join(paths.winBinaries, "codex.exe"), to: "codex.exe" },
      { from: path.join(paths.winBinaries, "rg.exe"), to: "rg.exe" },
      { from: path.join(paths.winExtra, "notification.wav"), to: "notification.wav" },
      { from: path.join(paths.winExtra, "THIRD_PARTY_NOTICES.txt"), to: "THIRD_PARTY_NOTICES.txt" },
    ],
    win: {
      target: [{ target: "nsis", arch: ["x64"] }],
      artifactName: `Codex-Setup-${appVersion}.exe`,
      icon: iconPath,
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowElevation: true,
      allowToChangeInstallationDirectory: true,
      installerIcon: "app.ico",
      uninstallerIcon: "app.ico",
      installerHeaderIcon: "app.ico",
    },
  };
}

async function findInstallerExe(releaseDir) {
  const names = await fs.readdir(releaseDir);
  const candidates = names
    .filter((name) => name.startsWith("Codex-Setup-") && name.endsWith(".exe"))
    .filter((name) => !name.includes("__uninstaller"))
    .map((name) => path.join(releaseDir, name));
  if (candidates.length === 0) {
    throw new Error(`No installer found in ${releaseDir}`);
  }
  const withStats = await Promise.all(candidates.map(async (file) => ({ file, stat: await fs.stat(file) })));
  withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return withStats[0].file;
}

function createPaths(toolkitRoot) {
  return {
    workDir: path.join(toolkitRoot, "work"),
    inputDmg: path.join(toolkitRoot, "work", "input", "Codex.dmg"),
    macResources: path.join(toolkitRoot, "work", "mac-resources"),
    appUnpacked: path.join(toolkitRoot, "work", "app-unpacked"),
    nativeDir: path.join(toolkitRoot, "work", "native-rebuild"),
    winSource: path.join(toolkitRoot, "work", "win-app-source"),
    winBinaries: path.join(toolkitRoot, "work", "win-binaries"),
    winExtra: path.join(toolkitRoot, "work", "win-extra"),
    releaseDir: path.join(toolkitRoot, "release"),
    builderConfig: path.join(toolkitRoot, "work", "electron-builder.generated.json"),
  };
}

async function prepareInputDmg(args, toolkitRoot, inputDmgPath) {
  if (args.dmgFile) {
    const explicitDmgFile = path.resolve(args.dmgFile);
    await fse.copy(explicitDmgFile, inputDmgPath);
    return { sourceDmgUrl: "", sourceDmgFile: explicitDmgFile };
  }

  const defaultLocalDmg = path.join(toolkitRoot, DEFAULT_LOCAL_DMG);
  if (!args.hasExplicitDmgUrl && (await fse.pathExists(defaultLocalDmg))) {
    await fse.copy(defaultLocalDmg, inputDmgPath);
    return { sourceDmgUrl: "", sourceDmgFile: path.resolve(defaultLocalDmg) };
  }

  await downloadFile(args.dmgUrl, inputDmgPath);
  return { sourceDmgUrl: args.dmgUrl, sourceDmgFile: "" };
}

async function main() {
  const args = parseArgs(process.argv);
  const scriptFile = fileURLToPath(import.meta.url);
  const toolkitRoot = path.resolve(path.dirname(scriptFile), "..");
  const paths = createPaths(toolkitRoot);

  await fse.emptyDir(paths.workDir);
  await fse.emptyDir(paths.releaseDir);
  const dmgSource = await prepareInputDmg(args, toolkitRoot, paths.inputDmg);

  const resourcesRoot = await extractResourcesFromDmg(paths.inputDmg, paths.macResources, path7z);
  await asar.extractAll(path.join(resourcesRoot, "app.asar"), paths.appUnpacked);
  const sourcePkg = JSON.parse(await fs.readFile(path.join(paths.appUnpacked, "package.json"), "utf8"));
  const versions = {
    electronVersion: args.electronVersion || normalizeSemver(sourcePkg.devDependencies?.electron, DEFAULT_ELECTRON_VERSION),
    nodePtyVersion: sourcePkg.dependencies?.["node-pty"] ?? DEFAULT_NODE_PTY_VERSION,
    sqliteVersion: sourcePkg.dependencies?.["better-sqlite3"] ?? DEFAULT_SQLITE_VERSION,
  };

  await prepareNativeModules(paths.nativeDir, versions);
  const prepared = await prepareWinSource(paths, sourcePkg, versions);
  const runtimePkg = prepared.runtimePackage;
  const binaries = await prepareBinaries(toolkitRoot, resourcesRoot, paths.winBinaries, paths.winExtra);
  await writeJson(paths.builderConfig, createBuilderConfig(paths, runtimePkg.version, binaries.iconPath));
  await run(
    "npx",
    ["electron-builder", "--config", paths.builderConfig, "--win", "nsis", "--x64", "--publish", "never"],
    { cwd: toolkitRoot },
  );

  const installerPath = await findInstallerExe(paths.releaseDir);
  const sha256 = await sha256File(installerPath);
  await writeJson(path.join(paths.releaseDir, "build-metadata.json"), {
    version: runtimePkg.version,
    electronVersion: versions.electronVersion,
    sourceDmgUrl: dmgSource.sourceDmgUrl,
    sourceDmgFile: dmgSource.sourceDmgFile,
    installerFile: path.resolve(installerPath),
    installerName: path.basename(installerPath),
    sha256,
    sunsetPatchApplied: true,
    sunsetPatchedFile: path.resolve(prepared.sunsetPatch.indexPath),
  });

  console.log(`Installer: ${path.resolve(installerPath)}`);
  console.log(`SHA256: ${sha256}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
