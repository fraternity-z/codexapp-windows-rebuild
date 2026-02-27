import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import fse from "fs-extra";

const DEFAULT_DMG_URL = "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg";

export function parseArgs(argv) {
  const options = {
    dmgUrl: DEFAULT_DMG_URL,
    dmgFile: "",
    electronVersion: "",
    hasExplicitDmgUrl: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (!value) {
      throw new Error(`Missing value for argument: ${arg}`);
    }
    if (arg === "--dmg-url") {
      options.dmgUrl = value;
      options.hasExplicitDmgUrl = true;
      i += 1;
      continue;
    }
    if (arg === "--dmg-file") {
      options.dmgFile = value;
      i += 1;
      continue;
    }
    if (arg === "--electron-version") {
      options.electronVersion = value;
      i += 1;
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  return options;
}

export async function run(command, args, options = {}) {
  const { cwd, env } = options;
  const resolvedCommand = resolveCommand(command);
  const useShell = process.platform === "win32" && resolvedCommand.endsWith(".cmd");
  const child = spawn(resolvedCommand, args, {
    cwd,
    env: env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: useShell,
  });
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
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`Command failed (${resolvedCommand} ${args.join(" ")}), code: ${exitCode}`);
  }
  return { stdout, stderr };
}

function resolveCommand(command) {
  if (process.platform !== "win32") {
    return command;
  }
  if (command.endsWith(".exe") || command.includes("\\") || command.includes("/")) {
    return command;
  }
  if (command === "npm" || command === "npx") {
    return `${command}.cmd`;
  }
  return command;
}

export async function downloadFile(url, targetPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  await fse.ensureDir(path.dirname(targetPath));
  await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath));
}

export async function extractResourcesFromDmg(dmgPath, macResourcesDir, path7z) {
  const listing = await run(path7z, ["l", dmgPath]);
  const resourcePrefix = parseResourcePrefix(listing.stdout);
  await run(path7z, ["x", dmgPath, `-o${macResourcesDir}`, `${resourcePrefix}*`]);
  const normalizedPrefix = resourcePrefix
    .replace(/\\/g, path.sep)
    .replace(/\//g, path.sep)
    .replace(new RegExp(`${path.sep}+$`), "");
  const resourcesRoot = path.join(macResourcesDir, normalizedPrefix);
  const asarPath = path.join(resourcesRoot, "app.asar");
  if (!(await fse.pathExists(asarPath))) {
    throw new Error(`Extracted resources missing app.asar: ${asarPath}`);
  }
  return resourcesRoot;
}

function parseResourcePrefix(listingText) {
  const marker = ".app\\Contents\\Resources\\app.asar";
  for (const line of listingText.split(/\r?\n/)) {
    const markerIndex = line.indexOf(marker);
    if (markerIndex < 0) {
      continue;
    }
    const prefixPart = line.slice(0, markerIndex);
    const columnSplit = prefixPart.lastIndexOf("  ");
    const pathStart = columnSplit >= 0 ? columnSplit : 0;
    const fullPath = line.slice(pathStart).trim();
    if (!fullPath.endsWith("app.asar")) {
      continue;
    }
    return fullPath.slice(0, -1 * "app.asar".length);
  }
  throw new Error("Unable to find .app/Contents/Resources/app.asar in DMG listing.");
}

export function normalizeSemver(versionRange, fallbackVersion) {
  if (!versionRange || typeof versionRange !== "string") {
    return fallbackVersion;
  }
  const match = versionRange.match(/\d+\.\d+\.\d+/);
  if (!match) {
    return fallbackVersion;
  }
  return match[0];
}

export async function writeJson(filePath, value) {
  await fse.ensureDir(path.dirname(filePath));
  const content = JSON.stringify(value, null, 2);
  await fs.writeFile(filePath, `${content}\n`, "utf8");
}

export async function findFileByName(rootDir, fileName) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = await findFileByName(fullPath, fileName);
      if (found) {
        return found;
      }
    }
  }
  return "";
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex").toUpperCase();
}
