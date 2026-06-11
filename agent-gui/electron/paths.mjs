import { existsSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const electronRoot = join(dirname(fileURLToPath(import.meta.url)));

function isPackagedDesktopShell() {
  // Match main.mjs: dir/unpacked QuickerAgent.exe may have isPackaged=false.
  return basename(process.execPath).toLowerCase() === "quickeragent.exe";
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

/**
 * Resolve bundled resources root (app/, node/, qkrpc/, rg/).
 * @param {{ isPackaged: boolean, resourcesPath?: string }} app
 */
export function resolveResourceRoot(app) {
  const base = packagedResourcesBase(app);
  if (base) {
    const nested = join(base, "resources");
    if (existsSync(join(nested, "app", "server.js"))) return nested;
    if (existsSync(join(base, "app", "server.js"))) return base;
    throw new Error(
      `runtime bundle not found under ${nested} or ${base}`,
    );
  }

  const devStaged = join(electronRoot, "resources");
  if (existsSync(join(devStaged, "app", "server.js"))) {
    return devStaged;
  }

  throw new Error(
    "electron/resources not staged — run pnpm electron:prepare (or electron:build) first",
  );
}

export function appRuntimeDir(resourceRoot) {
  return join(resourceRoot, "app");
}

export function bundledNodeExe(resourceRoot) {
  const win = process.platform === "win32";
  return join(resourceRoot, "node", win ? "node.exe" : "bin/node");
}

/**
 * Plugin registry / voice channel JSON (bootstrap, channel, manifest).
 * @param {import('electron').App} app
 * @param {boolean} isDev
 */
export function resolvePluginMetadataRoot(app, isDev) {
  if (!isDev) {
    return resolveResourceRoot(app);
  }
  const candidates = [
    join(electronRoot, "resources"),
    join(electronRoot, "..", "src-tauri", "resources"),
    join(electronRoot, "..", "src-tauri", "voice-plugin-metadata"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "plugin-registry-bootstrap.json"))) {
      return dir;
    }
  }
  throw new Error(
    "plugin-registry-bootstrap.json not found — run pnpm electron:prepare or ensure src-tauri/voice-plugin-metadata exists",
  );
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
