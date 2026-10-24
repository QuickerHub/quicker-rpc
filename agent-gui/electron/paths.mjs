import { existsSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRuntimeEntry } from "./runtime-entry.mjs";

const electronRoot = join(dirname(fileURLToPath(import.meta.url)));

function isPackagedDesktopShell() {
  const exe = basename(process.execPath).toLowerCase();
  return exe === "quickeragent.exe" || exe === "quicker-agent.exe";
}

function qkrpcDirHealthy(dir) {
  const kestrel = join(dir, "Microsoft.AspNetCore.Server.Kestrel.Core.dll");
  return existsSync(kestrel) && statSync(kestrel).size > 100_000;
}

function packagedResourcesBase(app) {
  if (app.resourcesPath) {
    return app.resourcesPath;
  }
  if (app.isPackaged || isPackagedDesktopShell()) {
    return join(dirname(process.execPath), "resources");
  }
  return null;
}

/** @param {string} resourceRoot */
export function bundledNodeExe(resourceRoot) {
  const win = process.platform === "win32";
  return join(resourceRoot, "node", win ? "node.exe" : "bin/node");
}

/** @param {string} dir */
export function isCompleteResourceRoot(dir, options = {}) {
  return resourceRootError(dir, options.runtimeMode) === null;
}

function resourceRootError(dir, runtimeMode) {
  try {
    resolveRuntimeEntry(join(dir, "app"), { mode: runtimeMode });
    if (!existsSync(bundledNodeExe(dir))) return `Bundled Node missing ${bundledNodeExe(dir)}`;
    return null;
  } catch (error) { return error.message; }
}

/**
 * Resolve bundled resources root (app/, node/, qkrpc/, rg/).
 * @param {{ isPackaged: boolean, resourcesPath?: string }} app
 */
export function resolveResourceRoot(app, options = {}) {
  const base = packagedResourcesBase(app);
  if (base) {
    const candidates = [base, join(base, "resources")];
    const failures = [];
    for (const root of candidates) {
      const error = resourceRootError(root, options.runtimeMode);
      if (error === null) return root;
      failures.push(`${root}: ${error}`);
    }
    throw new Error(
      `runtime bundle incomplete:\n${failures.join("\n")}`,
    );
  }

  const devStaged = join(electronRoot, "resources");
  if (isCompleteResourceRoot(devStaged, options)) {
    return devStaged;
  }

  throw new Error(
    `electron/resources not staged — run pnpm electron:prepare (or electron:build) first. ${resourceRootError(devStaged, options.runtimeMode)}`,
  );
}

export function appRuntimeDir(resourceRoot) {
  return join(resourceRoot, "app");
}

/**
 * Wait for a bundled file after in-place update (NSIS may still be copying).
 * @param {string} filePath
 * @param {{ timeoutMs?: number, intervalMs?: number }} [opts]
 */
export async function waitForBundledFile(
  filePath,
  { timeoutMs = 20_000, intervalMs = 250 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }
}

export function bundledQkrpcDir(resourceRoot) {
  const bundled = join(resourceRoot, "qkrpc");
  if (qkrpcDirHealthy(bundled)) return bundled;

  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const fallback = join(process.env.LOCALAPPDATA, "Programs", "qkrpc");
    if (qkrpcDirHealthy(fallback)) {
      console.warn(`bundled qkrpc missing; using fallback ${fallback}`);
      return fallback;
    }
  }

  return bundled;
}
