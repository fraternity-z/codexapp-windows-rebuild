import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";

import fse from "fs-extra";

const require = createRequire(import.meta.url);
const asar = require("@electron/asar");

const SOURCE_PACKAGE_FULL_NAME = "OpenAI.Codex_26.304.1528.0_x64__2p2nqsd0c76g0";
const SOURCE_INSTALL_LOCATION = path.join("C:\\Program Files\\WindowsApps", SOURCE_PACKAGE_FULL_NAME);
const OUTPUT_ROOT = "E:\\code\\codex-official-deconstructed";
const RAW_ROOT = path.join(OUTPUT_ROOT, "raw");
const RAW_PACKAGE_DIR = path.join(RAW_ROOT, SOURCE_PACKAGE_FULL_NAME);
const UNPACKED_APP_DIR = path.join(OUTPUT_ROOT, "unpacked", "app");
const RUNTIME_DIR = path.join(OUTPUT_ROOT, "unpacked", "resources-runtime");
const ANALYSIS_DIR = path.join(OUTPUT_ROOT, "analysis");
const PROTOCOL_DIR = path.join(ANALYSIS_DIR, "protocol");
const REPORTS_DIR = path.join(OUTPUT_ROOT, "reports");
const APP_RESOURCES_RELATIVE = path.join("app", "resources");
const REQUIRED_RUNTIME_FILES = ["notification.wav", "THIRD_PARTY_NOTICES.txt"];
const METHOD_REGEX = /"method"\s*:\s*"([^"]+)"/g;
const STRING_LITERAL_REGEX = /["']([A-Za-z][A-Za-z0-9/_-]{2,100})["']/g;
const MIME_PREFIX_BLOCKLIST = new Set([
  "application",
  "audio",
  "video",
  "image",
  "text",
  "model",
  "multipart",
  "message",
  "font",
  "chemical",
  "x-conference",
]);
const KNOWN_SINGLETON_METHODS = new Set([
  "initialize",
  "newConversation",
  "getConversationSummary",
  "listConversations",
  "resumeConversation",
  "forkConversation",
  "archiveConversation",
  "sendUserMessage",
  "sendUserTurn",
  "interruptConversation",
  "addConversationListener",
  "removeConversationListener",
  "gitDiffToRemote",
  "loginApiKey",
  "loginChatGpt",
  "cancelLoginChatGpt",
  "logoutChatGpt",
  "getAuthStatus",
  "getUserSavedConfig",
  "setDefaultModel",
  "getUserAgent",
  "userInfo",
  "fuzzyFileSearch",
  "execOneOffCommand",
  "authStatusChange",
  "loginChatGptComplete",
  "sessionConfigured",
  "deprecationNotice",
  "configWarning",
]);

function toPosix(filePath) {
  return filePath.replaceAll("\\", "/");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function nowIso() {
  return new Date().toISOString();
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex").toUpperCase();
}

async function run(command, args, options = {}) {
  const { cwd } = options;
  const resolvedCommand = process.platform === "win32" && !command.toLowerCase().endsWith(".exe")
    ? (command.endsWith(".cmd") ? command : `${command}.cmd`)
    : command;
  const useShell = process.platform === "win32" && resolvedCommand.toLowerCase().endsWith(".cmd");
  const child = spawn(resolvedCommand, args, { cwd, shell: useShell, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0) {
    const detail = `Command failed: ${resolvedCommand} ${args.join(" ")}\nexitCode=${code}\nstdout=${stdout}\nstderr=${stderr}`;
    throw new Error(detail);
  }
  return { stdout, stderr };
}

async function writeJson(filePath, data) {
  await fse.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function listFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      files.push(fullPath);
    }
  }
  files.sort((left, right) => left.localeCompare(right));
  return files;
}

function classifyLayer(relativePath) {
  const normalized = toPosix(relativePath);
  if (normalized === "unpacked/app/.vite/build/main.js") {
    return "main";
  }
  if (normalized === "unpacked/app/.vite/build/preload.js") {
    return "preload";
  }
  if (normalized === "unpacked/app/.vite/build/worker.js") {
    return "worker";
  }
  if (normalized.startsWith("unpacked/app/webview/")) {
    return "webview";
  }
  if (normalized.endsWith(".node")) {
    return "native";
  }
  if (normalized.startsWith("unpacked/resources-runtime/app.asar.unpacked/node_modules/")) {
    return "native";
  }
  return "runtime";
}

function parseManifestVersion(manifestXml) {
  const versionMatch = manifestXml.match(/Identity[^>]*Version="([^"]+)"/i);
  if (!versionMatch) {
    throw new Error("Failed to parse version from AppxManifest.xml");
  }
  return versionMatch[1];
}

function parseMethodLiterals(fileContent) {
  const matches = [];
  for (const match of fileContent.matchAll(METHOD_REGEX)) {
    matches.push(match[1]);
  }
  return uniqueSorted(matches);
}

function extractMethodLikeStrings(mainJsContent) {
  const candidates = [];
  for (const match of mainJsContent.matchAll(STRING_LITERAL_REGEX)) {
    const value = match[1];
    if (value.includes("://") || value.includes("\\")) {
      continue;
    }
    if (!value.includes("/")) {
      if (KNOWN_SINGLETON_METHODS.has(value)) {
        candidates.push(value);
      }
      continue;
    }
    if (!/^[A-Za-z][A-Za-z0-9/_-]+$/.test(value)) {
      continue;
    }
    if (value.split("/").length > 6) {
      continue;
    }
    const firstSegment = value.split("/", 1)[0].toLowerCase();
    if (MIME_PREFIX_BLOCKLIST.has(firstSegment)) {
      continue;
    }
    candidates.push(value);
  }
  return uniqueSorted(candidates);
}

function buildRenameCandidates(missingMethods, extraMethods) {
  const missingByTail = new Map();
  for (const method of missingMethods) {
    const tail = method.split("/").at(-1);
    if (!tail) {
      continue;
    }
    const current = missingByTail.get(tail) ?? [];
    current.push(method);
    missingByTail.set(tail, current);
  }
  const pairs = [];
  for (const method of extraMethods) {
    const tail = method.split("/").at(-1);
    const candidates = missingByTail.get(tail) ?? [];
    for (const missing of candidates) {
      pairs.push({ from: missing, to: method, reason: "same-tail-segment" });
    }
  }
  return pairs;
}

function parseBundlePrefix(fileName) {
  const matched = fileName.match(/^(.+)-[A-Za-z0-9_-]{6,}\.[A-Za-z0-9]+$/);
  if (!matched) {
    return "unmatched";
  }
  return matched[1];
}

async function generateSourceMetadata(paths) {
  const { manifestPath, asarPath, codexExePath, rgExePath, sourceInstallLocation } = paths;
  const manifestXml = await fs.readFile(manifestPath, "utf8");
  const manifestVersion = parseManifestVersion(manifestXml);
  const packageJsonContent = asar.extractFile(asarPath, "package.json").toString("utf8");
  const packageJson = JSON.parse(packageJsonContent);
  const files = [];
  for (const targetPath of [asarPath, codexExePath, rgExePath]) {
    const stat = await fs.stat(targetPath);
    files.push({
      name: path.basename(targetPath),
      path: targetPath,
      size: stat.size,
      sha256: await sha256File(targetPath),
    });
  }
  return {
    package_full_name: SOURCE_PACKAGE_FULL_NAME,
    version: manifestVersion,
    install_location: sourceInstallLocation,
    app_version: packageJson.version,
    build_number: packageJson.codexBuildNumber ?? "",
    files,
    captured_at: nowIso(),
  };
}

async function copyRuntimeResources(rawResourcesDir) {
  await fse.emptyDir(RUNTIME_DIR);
  const unpackedDir = path.join(rawResourcesDir, "app.asar.unpacked");
  if (!(await fse.pathExists(unpackedDir))) {
    throw new Error(`Missing app.asar.unpacked: ${unpackedDir}`);
  }
  await fse.copy(unpackedDir, path.join(RUNTIME_DIR, "app.asar.unpacked"));
  for (const fileName of REQUIRED_RUNTIME_FILES) {
    const sourcePath = path.join(rawResourcesDir, fileName);
    if (!(await fse.pathExists(sourcePath))) {
      throw new Error(`Missing runtime file: ${sourcePath}`);
    }
    await fse.copy(sourcePath, path.join(RUNTIME_DIR, fileName));
  }
  const entries = await fs.readdir(rawResourcesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (!/^(codex.*|rg(\.exe)?)$/i.test(entry.name)) {
      continue;
    }
    const from = path.join(rawResourcesDir, entry.name);
    const to = path.join(RUNTIME_DIR, entry.name);
    await fse.copy(from, to);
  }
}

async function generateTreeJson() {
  const roots = [
    path.join(OUTPUT_ROOT, "unpacked", "app"),
    path.join(OUTPUT_ROOT, "unpacked", "resources-runtime"),
  ];
  const entries = [];
  for (const rootDir of roots) {
    const files = await listFiles(rootDir);
    for (const filePath of files) {
      const relativePath = path.relative(OUTPUT_ROOT, filePath);
      const stats = await fs.stat(filePath);
      entries.push({
        path: toPosix(relativePath),
        size: stats.size,
        sha256: await sha256File(filePath),
        extension: path.extname(filePath).toLowerCase() || "",
        layer: classifyLayer(relativePath),
      });
    }
  }
  const summary = {
    file_count: entries.length,
    total_size: entries.reduce((total, entry) => total + entry.size, 0),
    generated_at: nowIso(),
  };
  const actualFileCount = (await listFiles(path.join(OUTPUT_ROOT, "unpacked"))).length;
  summary.count_check = {
    tree_count: entries.length,
    actual_count: actualFileCount,
    delta: entries.length - actualFileCount,
  };
  if (summary.count_check.delta !== 0) {
    throw new Error(`tree.json count mismatch: ${JSON.stringify(summary.count_check)}`);
  }
  return { summary, entries };
}

async function generateEntrypointsJson() {
  const packageJsonPath = path.join(UNPACKED_APP_DIR, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  const mainPath = path.join(UNPACKED_APP_DIR, packageJson.main);
  const preloadPath = path.join(UNPACKED_APP_DIR, ".vite", "build", "preload.js");
  const workerPath = path.join(UNPACKED_APP_DIR, ".vite", "build", "worker.js");
  for (const requiredPath of [mainPath, preloadPath, workerPath]) {
    if (!(await fse.pathExists(requiredPath))) {
      throw new Error(`Missing entrypoint file: ${requiredPath}`);
    }
  }
  const items = [];
  for (const [name, filePath] of [
    ["main", mainPath],
    ["preload", preloadPath],
    ["worker", workerPath],
  ]) {
    const stat = await fs.stat(filePath);
    items.push({
      name,
      relative_path: toPosix(path.relative(UNPACKED_APP_DIR, filePath)),
      size: stat.size,
      sha256: await sha256File(filePath),
    });
  }
  return {
    package_main: packageJson.main,
    version: packageJson.version,
    codex_build_number: packageJson.codexBuildNumber ?? "",
    generated_at: nowIso(),
    entrypoints: items,
  };
}

async function generateWebviewBundlesJson() {
  const assetsDir = path.join(UNPACKED_APP_DIR, "webview", "assets");
  const fileNames = await fs.readdir(assetsDir);
  const entries = [];
  for (const fileName of fileNames.sort((a, b) => a.localeCompare(b))) {
    const filePath = path.join(assetsDir, fileName);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      continue;
    }
    entries.push({
      name: fileName,
      size: stat.size,
      extension: path.extname(fileName).toLowerCase() || "",
      prefix: parseBundlePrefix(fileName),
    });
  }
  const byExtension = {};
  const byPrefix = {};
  for (const entry of entries) {
    byExtension[entry.extension] ??= { count: 0, bytes: 0 };
    byExtension[entry.extension].count += 1;
    byExtension[entry.extension].bytes += entry.size;
    byPrefix[entry.prefix] ??= { count: 0, bytes: 0 };
    byPrefix[entry.prefix].count += 1;
    byPrefix[entry.prefix].bytes += entry.size;
  }
  const indexFiles = entries.filter((entry) => /^index-.*\.js$/i.test(entry.name)).map((entry) => entry.name);
  return {
    generated_at: nowIso(),
    assets_dir: toPosix(path.relative(OUTPUT_ROOT, assetsDir)),
    total_files: entries.length,
    total_bytes: entries.reduce((total, entry) => total + entry.size, 0),
    index_file_candidates: indexFiles,
    extension_distribution: byExtension,
    prefix_distribution: byPrefix,
    chunks: entries,
  };
}

async function findNodeFiles(rootDir) {
  if (!(await fse.pathExists(rootDir))) {
    return [];
  }
  const files = await listFiles(rootDir);
  const result = [];
  for (const filePath of files) {
    if (!filePath.toLowerCase().endsWith(".node")) {
      continue;
    }
    const stat = await fs.stat(filePath);
    result.push({
      path: toPosix(path.relative(OUTPUT_ROOT, filePath)),
      size: stat.size,
      sha256: await sha256File(filePath),
    });
  }
  return result;
}

async function generateNativeModulesJson() {
  const modules = ["better-sqlite3", "node-pty"];
  const results = [];
  for (const moduleName of modules) {
    const asarModuleRoot = path.join(UNPACKED_APP_DIR, "node_modules", moduleName);
    const runtimeModuleRoot = path.join(RUNTIME_DIR, "app.asar.unpacked", "node_modules", moduleName);
    const packageJsonPath = path.join(asarModuleRoot, "package.json");
    const version = (await fse.pathExists(packageJsonPath))
      ? JSON.parse(await fs.readFile(packageJsonPath, "utf8")).version
      : "";
    results.push({
      module: moduleName,
      version,
      asar_module_root: toPosix(path.relative(OUTPUT_ROOT, asarModuleRoot)),
      runtime_module_root: toPosix(path.relative(OUTPUT_ROOT, runtimeModuleRoot)),
      asar_node_files: await findNodeFiles(asarModuleRoot),
      runtime_node_files: await findNodeFiles(runtimeModuleRoot),
    });
  }
  return { generated_at: nowIso(), modules: results };
}

async function generateLatestProtocol() {
  const latestTsDir = path.join(PROTOCOL_DIR, "latest", "ts");
  const latestSchemaDir = path.join(PROTOCOL_DIR, "latest", "schema");
  await fse.emptyDir(latestTsDir);
  await fse.emptyDir(latestSchemaDir);
  await run("npx.cmd", ["--yes", "@openai/codex@latest", "app-server", "generate-ts", "--out", latestTsDir], {
    cwd: OUTPUT_ROOT,
  });
  await run(
    "npx.cmd",
    ["--yes", "@openai/codex@latest", "app-server", "generate-json-schema", "--out", latestSchemaDir],
    { cwd: OUTPUT_ROOT },
  );
  const clientRequestTs = await fs.readFile(path.join(latestTsDir, "ClientRequest.ts"), "utf8");
  const serverNotificationTs = await fs.readFile(path.join(latestTsDir, "ServerNotification.ts"), "utf8");
  return {
    latest_ts_dir: latestTsDir,
    latest_schema_dir: latestSchemaDir,
    latest_request_methods: parseMethodLiterals(clientRequestTs),
    latest_notification_methods: parseMethodLiterals(serverNotificationTs),
  };
}

async function generateOfficialObservedMethods(latestProtocol) {
  const mainJsPath = path.join(UNPACKED_APP_DIR, ".vite", "build", "main.js");
  const mainJsContent = await fs.readFile(mainJsPath, "utf8");
  const observed = extractMethodLikeStrings(mainJsContent);
  const latestRequestSet = new Set(latestProtocol.latest_request_methods);
  const latestNotificationSet = new Set(latestProtocol.latest_notification_methods);
  const requestCandidates = observed.filter((method) => latestRequestSet.has(method));
  const notificationCandidates = observed.filter((method) => latestNotificationSet.has(method));
  const known = new Set([...requestCandidates, ...notificationCandidates]);
  const unknown = observed.filter((method) => !known.has(method));
  return {
    source_main_js: toPosix(path.relative(OUTPUT_ROOT, mainJsPath)),
    extracted_at: nowIso(),
    request_method_candidates: requestCandidates,
    notification_method_candidates: notificationCandidates,
    unknown_method_like_strings: unknown,
    total_candidates: observed.length,
  };
}

function buildDiffReport(latestProtocol, observedMethods) {
  const observedUnion = uniqueSorted([
    ...observedMethods.request_method_candidates,
    ...observedMethods.notification_method_candidates,
  ]);
  const latestUnion = uniqueSorted([
    ...latestProtocol.latest_request_methods,
    ...latestProtocol.latest_notification_methods,
  ]);
  const observedSet = new Set(observedUnion);
  const latestSet = new Set(latestUnion);
  const missingRequests = latestProtocol.latest_request_methods.filter((method) => !observedSet.has(method));
  const missingNotifications = latestProtocol.latest_notification_methods.filter((method) => !observedSet.has(method));
  const extraObserved = observedUnion.filter((method) => !latestSet.has(method));
  const renameCandidates = buildRenameCandidates(
    [...missingRequests, ...missingNotifications],
    [...extraObserved, ...observedMethods.unknown_method_like_strings],
  );
  return {
    observed_count: observedUnion.length,
    latest_count: latestUnion.length,
    missing_requests_count: missingRequests.length,
    missing_notifications_count: missingNotifications.length,
    extra_observed_count: extraObserved.length,
    missing_requests: missingRequests,
    missing_notifications: missingNotifications,
    extra_observed: extraObserved,
    rename_candidates: renameCandidates,
  };
}

function renderDiffReportMarkdown(diff) {
  const lines = [];
  lines.push("# Protocol Diff Report");
  lines.push("");
  lines.push(`- generated_at: ${nowIso()}`);
  lines.push(`- observed_count: ${diff.observed_count}`);
  lines.push(`- latest_count: ${diff.latest_count}`);
  lines.push(`- missing_requests_count: ${diff.missing_requests_count}`);
  lines.push(`- missing_notifications_count: ${diff.missing_notifications_count}`);
  lines.push(`- extra_observed_count: ${diff.extra_observed_count}`);
  lines.push("");
  lines.push("## Missing Request Methods (latest -> observed)");
  lines.push("");
  for (const method of diff.missing_requests) {
    lines.push(`- ${method}`);
  }
  lines.push("");
  lines.push("## Missing Notification Methods (latest -> observed)");
  lines.push("");
  for (const method of diff.missing_notifications) {
    lines.push(`- ${method}`);
  }
  lines.push("");
  lines.push("## Extra Observed Methods (observed -> latest)");
  lines.push("");
  for (const method of diff.extra_observed) {
    lines.push(`- ${method}`);
  }
  lines.push("");
  lines.push("## Rename Candidates");
  lines.push("");
  for (const candidate of diff.rename_candidates) {
    lines.push(`- ${candidate.from} -> ${candidate.to} (${candidate.reason})`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function tryGenerateOfficialRuntimeProtocol(rawResourcesDir) {
  const runtimeRoot = path.join(PROTOCOL_DIR, "official-runtime");
  const tsDir = path.join(runtimeRoot, "ts");
  const schemaDir = path.join(runtimeRoot, "schema");
  await fse.emptyDir(runtimeRoot);
  const codexExe = path.join(rawResourcesDir, "codex.exe");
  if (!(await fse.pathExists(codexExe))) {
    const errorText = `Missing codex.exe: ${codexExe}`;
    await fs.writeFile(path.join(runtimeRoot, "generation-error.txt"), `${errorText}\n`, "utf8");
    return { success: false, error: errorText };
  }
  try {
    await run(codexExe, ["app-server", "generate-ts", "--out", tsDir], { cwd: runtimeRoot });
    await run(codexExe, ["app-server", "generate-json-schema", "--out", schemaDir], { cwd: runtimeRoot });
    return { success: true, tsDir, schemaDir };
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    await fs.writeFile(path.join(runtimeRoot, "generation-error.txt"), `${errorText}\n`, "utf8");
    return { success: false, error: errorText };
  }
}

function selectUiSurfaceCandidates(bundleData) {
  const keywords = ["index", "agent", "settings", "diff", "thread", "model", "auth", "login", "skill"];
  const selected = [];
  for (const chunk of bundleData.chunks) {
    const normalized = chunk.name.toLowerCase();
    if (!keywords.some((keyword) => normalized.includes(keyword))) {
      continue;
    }
    selected.push({ name: chunk.name, size: chunk.size, prefix: chunk.prefix });
  }
  return selected.slice(0, 60);
}

async function writeReports(context) {
  const { sourceMetadata, entrypoints, webviewBundles, latestProtocol, diffSummary, runtimeProtocolStatus } = context;
  const replicationLines = [];
  replicationLines.push("# REPLICATION_BASELINE");
  replicationLines.push("");
  replicationLines.push(`- source_package: ${sourceMetadata.package_full_name}`);
  replicationLines.push(`- version: ${sourceMetadata.version}`);
  replicationLines.push(`- app_version: ${sourceMetadata.app_version}`);
  replicationLines.push(`- build_number: ${sourceMetadata.build_number}`);
  replicationLines.push("");
  replicationLines.push("## Module Layers");
  replicationLines.push("- main: .vite/build/main.js (Electron 主进程汇总逻辑)");
  replicationLines.push("- preload: .vite/build/preload.js (渲染进程桥接)");
  replicationLines.push("- worker: .vite/build/worker.js (后台任务执行)");
  replicationLines.push("- webview: webview/assets/* (UI 资源与 chunk)");
  replicationLines.push("- native: app.asar.unpacked/node_modules/*.node (node-pty / better-sqlite3)");
  replicationLines.push("- runtime: codex*.exe, rg*, notification.wav, THIRD_PARTY_NOTICES.txt");
  replicationLines.push("");
  replicationLines.push("## Startup Chain");
  replicationLines.push("1. MSIX `app\\Codex.exe` 启动并加载 `app/resources/app.asar`。");
  replicationLines.push(`2. Electron 主入口按 package.main 进入 \`${entrypoints.package_main}\`。`);
  replicationLines.push("3. 主进程创建渲染窗口并注入 preload。");
  replicationLines.push("4. 渲染层加载 webview/assets 的 index chunk 与功能 chunk。");
  replicationLines.push("5. 命令与工具链通过 codex 可执行文件、node-pty、rg 等组件完成。");
  replicationLines.push("");
  replicationLines.push("## Core Conversation Flow Mapping");
  replicationLines.push("- Thread 层: thread/start, thread/resume, thread/fork, thread/archive, thread/read。");
  replicationLines.push("- Turn 层: turn/start, turn/steer, turn/interrupt。");
  replicationLines.push("- Item 层: item/started, item/completed, item/*/delta。");
  replicationLines.push("- Tool/Exec 层: command/exec, item/commandExecution/outputDelta, item/mcpToolCall/progress。");
  replicationLines.push("- 回写层: thread/tokenUsage/updated, turn/diff/updated, turn/plan/updated。");
  replicationLines.push("");
  await fs.writeFile(path.join(REPORTS_DIR, "REPLICATION_BASELINE.md"), `${replicationLines.join("\n")}\n`, "utf8");

  const uiLines = [];
  uiLines.push("# UI_SURFACE_MAP");
  uiLines.push("");
  uiLines.push(`- index_file_candidates: ${webviewBundles.index_file_candidates.join(", ")}`);
  uiLines.push("- 说明: 以下映射基于 chunk 文件名语义与体积分布，用于后续像素级复刻时的优先级排序。");
  uiLines.push("");
  uiLines.push("## Suggested Surface Mapping");
  uiLines.push("- Root Shell / Router: index-*.js");
  uiLines.push("- Agent / Conversation Surface: *agent* / *thread* / *model* 相关 chunk");
  uiLines.push("- Settings Surface: *settings* 相关 chunk");
  uiLines.push("- Auth Surface: *auth* / *login* 相关 chunk");
  uiLines.push("- Diff / Review Surface: *diff* 相关 chunk");
  uiLines.push("- Skills Surface: *skill* 相关 chunk");
  uiLines.push("");
  uiLines.push("## Candidate Bundles");
  for (const candidate of selectUiSurfaceCandidates(webviewBundles)) {
    uiLines.push(`- ${candidate.name} | size=${candidate.size} | prefix=${candidate.prefix}`);
  }
  uiLines.push("");
  await fs.writeFile(path.join(REPORTS_DIR, "UI_SURFACE_MAP.md"), `${uiLines.join("\n")}\n`, "utf8");

  const windowsLines = [];
  windowsLines.push("# WINDOWS_COMPAT_NOTES");
  windowsLines.push("");
  windowsLines.push(`- package_version: ${sourceMetadata.version}`);
  windowsLines.push("- MSIX 清单权限: runFullTrust + internetClient。");
  windowsLines.push("- WindowsApps 下二进制直接执行存在 ACL 限制，需复制到可执行目录后再做运行态分析。");
  windowsLines.push("- 运行时关键文件: codex.exe, codex-command-runner.exe, codex-windows-sandbox-setup.exe, rg.exe。");
  windowsLines.push("- 本次协议运行态提取状态:");
  if (runtimeProtocolStatus.success) {
    windowsLines.push(`  - success: true`);
    windowsLines.push(`  - ts_dir: ${toPosix(path.relative(OUTPUT_ROOT, runtimeProtocolStatus.tsDir))}`);
    windowsLines.push(`  - schema_dir: ${toPosix(path.relative(OUTPUT_ROOT, runtimeProtocolStatus.schemaDir))}`);
  } else {
    windowsLines.push("  - success: false");
    windowsLines.push(`  - error_file: ${toPosix(path.relative(OUTPUT_ROOT, path.join(PROTOCOL_DIR, "official-runtime", "generation-error.txt")))}`);
  }
  windowsLines.push("- 协议层观察到 Windows 专项能力: windowsSandbox/setupStart, windowsSandbox/setupCompleted, windows/worldWritableWarning。");
  windowsLines.push("- 终端执行链路复刻建议: 保留 command/exec + item/commandExecution/outputDelta 事件流模型。");
  windowsLines.push("");
  windowsLines.push("## Protocol Coverage Snapshot");
  windowsLines.push(`- latest_request_methods: ${latestProtocol.latest_request_methods.length}`);
  windowsLines.push(`- latest_notification_methods: ${latestProtocol.latest_notification_methods.length}`);
  windowsLines.push(`- missing_requests_in_observed: ${diffSummary.missing_requests_count}`);
  windowsLines.push(`- missing_notifications_in_observed: ${diffSummary.missing_notifications_count}`);
  windowsLines.push("");
  await fs.writeFile(path.join(REPORTS_DIR, "WINDOWS_COMPAT_NOTES.md"), `${windowsLines.join("\n")}\n`, "utf8");
}

async function runAcceptanceChecks(context) {
  const checks = [];
  const requiredEntrypoints = [
    path.join(UNPACKED_APP_DIR, ".vite", "build", "main.js"),
    path.join(UNPACKED_APP_DIR, ".vite", "build", "preload.js"),
    path.join(UNPACKED_APP_DIR, ".vite", "build", "worker.js"),
  ];
  for (const targetPath of requiredEntrypoints) {
    checks.push({
      name: `exists:${toPosix(path.relative(OUTPUT_ROOT, targetPath))}`,
      pass: await fse.pathExists(targetPath),
    });
  }
  const indexFiles = context.webviewBundles.index_file_candidates;
  checks.push({ name: "webview:index-files", pass: indexFiles.length > 0 });
  for (const fileInfo of context.sourceMetadata.files) {
    const actualHash = await sha256File(fileInfo.path);
    checks.push({ name: `hash:${fileInfo.name}`, pass: actualHash === fileInfo.sha256 });
  }
  const latestTsCount = (await listFiles(path.join(PROTOCOL_DIR, "latest", "ts"))).length;
  const latestSchemaCount = (await listFiles(path.join(PROTOCOL_DIR, "latest", "schema"))).length;
  checks.push({ name: "protocol:latest-ts", pass: latestTsCount > 0 });
  checks.push({ name: "protocol:latest-schema", pass: latestSchemaCount > 0 });
  checks.push({
    name: "protocol:official-observed-non-empty",
    pass:
      context.observedMethods.request_method_candidates.length +
        context.observedMethods.notification_method_candidates.length >
      0,
  });
  checks.push({
    name: "tree:count-delta-zero",
    pass: context.tree.summary.count_check.delta === 0,
  });
  const failed = checks.filter((check) => !check.pass);
  const result = { generated_at: nowIso(), checks, failed_count: failed.length };
  await writeJson(path.join(ANALYSIS_DIR, "verification.json"), result);
  if (failed.length > 0) {
    const failedNames = failed.map((check) => check.name).join(", ");
    throw new Error(`Acceptance checks failed: ${failedNames}`);
  }
}

async function main() {
  if (!(await fse.pathExists(SOURCE_INSTALL_LOCATION))) {
    throw new Error(`Source package not found: ${SOURCE_INSTALL_LOCATION}`);
  }
  await fse.remove(OUTPUT_ROOT);
  await fse.ensureDir(OUTPUT_ROOT);
  await fse.ensureDir(ANALYSIS_DIR);
  await fse.ensureDir(REPORTS_DIR);

  console.log(`[1/8] Copy source package: ${SOURCE_INSTALL_LOCATION}`);
  await fse.copy(SOURCE_INSTALL_LOCATION, RAW_PACKAGE_DIR);
  const rawResourcesDir = path.join(RAW_PACKAGE_DIR, APP_RESOURCES_RELATIVE);
  const sourceMetadata = await generateSourceMetadata({
    manifestPath: path.join(RAW_PACKAGE_DIR, "AppxManifest.xml"),
    asarPath: path.join(rawResourcesDir, "app.asar"),
    codexExePath: path.join(rawResourcesDir, "codex.exe"),
    rgExePath: path.join(rawResourcesDir, "rg.exe"),
    sourceInstallLocation: SOURCE_INSTALL_LOCATION,
  });
  await writeJson(path.join(ANALYSIS_DIR, "source-metadata.json"), sourceMetadata);

  console.log("[2/8] Extract app.asar and runtime resources");
  await fse.emptyDir(UNPACKED_APP_DIR);
  await asar.extractAll(path.join(rawResourcesDir, "app.asar"), UNPACKED_APP_DIR);
  await copyRuntimeResources(rawResourcesDir);

  console.log("[3/8] Generate structure maps");
  const tree = await generateTreeJson();
  await writeJson(path.join(ANALYSIS_DIR, "tree.json"), tree);
  const entrypoints = await generateEntrypointsJson();
  await writeJson(path.join(ANALYSIS_DIR, "entrypoints.json"), entrypoints);
  const webviewBundles = await generateWebviewBundlesJson();
  await writeJson(path.join(ANALYSIS_DIR, "webview-bundles.json"), webviewBundles);
  const nativeModules = await generateNativeModulesJson();
  await writeJson(path.join(ANALYSIS_DIR, "native-modules.json"), nativeModules);

  console.log("[4/8] Generate latest app-server protocol");
  const latestProtocol = await generateLatestProtocol();

  console.log("[5/8] Extract observed protocol from official main.js");
  const observedMethods = await generateOfficialObservedMethods(latestProtocol);
  const observedDir = path.join(PROTOCOL_DIR, "official-observed");
  await fse.ensureDir(observedDir);
  await writeJson(path.join(observedDir, "methods.json"), observedMethods);
  const diffSummary = buildDiffReport(latestProtocol, observedMethods);
  await fs.writeFile(path.join(PROTOCOL_DIR, "diff-report.md"), renderDiffReportMarkdown(diffSummary), "utf8");

  console.log("[6/8] Try runtime protocol generation from copied codex.exe");
  const runtimeProtocolStatus = await tryGenerateOfficialRuntimeProtocol(rawResourcesDir);
  await writeJson(path.join(PROTOCOL_DIR, "official-runtime", "status.json"), runtimeProtocolStatus);

  console.log("[7/8] Write replication reports");
  await writeReports({
    sourceMetadata,
    entrypoints,
    webviewBundles,
    latestProtocol,
    diffSummary,
    runtimeProtocolStatus,
  });

  console.log("[8/8] Run acceptance checks");
  await runAcceptanceChecks({
    sourceMetadata,
    observedMethods,
    tree,
    webviewBundles,
  });

  console.log(`Done. Output root: ${OUTPUT_ROOT}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
