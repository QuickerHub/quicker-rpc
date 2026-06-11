/**
 * Stage Next standalone + qkrpc + portable Node for desktop bundles (Tauri / Electron).
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareBundledLlmRuntime } from "./embed-bundled-llm-secrets.mjs";
import { prepareRemoteCipherPepper } from "./embed-remote-cipher-pepper.mjs";

const defaultAgentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultRepoRoot = join(defaultAgentGuiRoot, "..");

const VOICE_RESOURCE_FILES = [
  "voice-plugin-manifest.json",
  "voice-plugin-channel.json",
  "voice-sensevoice-model-identity.json",
  "plugin-registry-bootstrap.json",
];

const NODE_VERSION = process.env.DESKTOP_BUNDLE_NODE_VERSION
  ?? process.env.TAURI_NODE_VERSION
  ?? "22.14.0";
const RIPGREP_VERSION = process.env.DESKTOP_BUNDLE_RIPGREP_VERSION
  ?? process.env.TAURI_RIPGREP_VERSION
  ?? "15.1.0";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

/** @returns {string} X.Y.Z from version.json QuickerRpc */
export function readDesktopBundleSemver(repoRoot = defaultRepoRoot) {
  const raw = readFileSync(join(repoRoot, "version.json"), "utf8");
  const data = JSON.parse(raw);
  const parts = String(data.QuickerRpc ?? "0.0.0")
    .trim()
    .replace(/^v/, "")
    .split(".");
  if (parts.length < 3) {
    throw new Error(`version.json QuickerRpc must have at least 3 segments`);
  }
  return parts.slice(0, 3).join(".");
}

function ensureQkrpcCli(repoRoot) {
  const cliDir = join(repoRoot, "publish", "cli");
  const exe = join(cliDir, "qkrpc.exe");
  if (!existsSync(exe)) {
    console.log("Building qkrpc (publish/cli)...");
    run("pwsh", [
      "-NoProfile",
      "-File",
      join(repoRoot, "publish", "publish-rpc.ps1"),
      "-SkipInstall",
      "-SkipPackaging",
    ]);
  }
  if (!existsSync(exe)) {
    throw new Error(`qkrpc.exe not found: ${exe}`);
  }
  return cliDir;
}

function resolveStandaloneSrc(agentGuiRoot) {
  const base = join(agentGuiRoot, ".next", "standalone");
  const direct = join(base, "server.js");
  if (existsSync(direct)) return base;
  const nested = join(base, "agent-gui", "server.js");
  if (existsSync(nested)) return join(base, "agent-gui");
  throw new Error(`Run pnpm build first. Missing standalone server.js under ${base}`);
}

function stripNestedBundleArtifacts(appRoot) {
  for (const name of ["src-tauri", "agent-gui", "electron"]) {
    const nested = join(appRoot, name);
    if (existsSync(nested)) {
      rmSync(nested, { recursive: true, force: true });
      console.log(`Removed traced ${name} from staged app: ${nested}`);
    }
  }
}

function ensureNextStandaloneRuntimes(agentGuiRoot, appRoot) {
  const srcNext = join(agentGuiRoot, "node_modules", "next", "dist");
  const dstNext = join(appRoot, "node_modules", "next", "dist");
  const mergeDirs = [
    ["compiled", "next-server"],
    ["server", "app-render"],
  ];

  for (const parts of mergeDirs) {
    const rel = join(...parts);
    const src = join(srcNext, rel);
    const dest = join(dstNext, rel);
    if (!existsSync(src)) {
      throw new Error(`Missing Next.js runtime source: ${src}`);
    }
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
    }
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });
  }

  console.log("Next standalone runtimes merged (next-server + app-render)");
}

function patchStandaloneServerEntry(appRoot) {
  const serverPath = join(appRoot, "server.js");
  let src = readFileSync(serverPath, "utf8");
  const marker =
    "process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig)";
  if (!src.includes(marker)) {
    throw new Error(`server.js missing standalone config marker: ${serverPath}`);
  }
  if (src.includes("patchMonorepoStandalonePaths")) {
    console.log("server.js already patched for portable standalone paths");
    return;
  }

  const patchBlock = `const fs = require('fs')

function patchMonorepoStandalonePaths(root, cfg) {
  if (!cfg || typeof cfg !== 'object') return cfg
  cfg.outputFileTracingRoot = root
  if (cfg.turbopack && typeof cfg.turbopack === 'object') cfg.turbopack.root = root
  return cfg
}

patchMonorepoStandalonePaths(dir, nextConfig)
const rsfPath = path.join(dir, '.next', 'required-server-files.json')
if (fs.existsSync(rsfPath)) {
  const rsf = JSON.parse(fs.readFileSync(rsfPath, 'utf8').replace(/^\\uFEFF/, ''))
  rsf.appDir = dir
  rsf.relativeAppDir = '.'
  patchMonorepoStandalonePaths(dir, rsf.config)
  fs.writeFileSync(rsfPath, JSON.stringify(rsf))
}

`;

  writeFileSync(serverPath, src.replace(marker, patchBlock + marker), "utf8");
  console.log("server.js patched for portable standalone paths");
}

function stageBrowserRuntime(agentGuiRoot, appRoot) {
  const src = join(agentGuiRoot, "browser-runtime");
  const dest = join(appRoot, "browser-runtime");
  if (!existsSync(src)) {
    throw new Error(`Missing browser-runtime sources: ${src}`);
  }
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  cpSync(src, dest, { recursive: true });
  console.log(`browser-runtime staged: ${dest}`);
}

/**
 * @param {{
 *   resourcesDir: string,
 *   voiceMetadataSrc: string,
 *   agentGuiRoot?: string,
 *   repoRoot?: string,
 * }} ctx
 */
export function stageNextStandalone(ctx) {
  const agentGuiRoot = ctx.agentGuiRoot ?? defaultAgentGuiRoot;
  const repoRoot = ctx.repoRoot ?? defaultRepoRoot;
  const { resourcesDir } = ctx;
  const appDir = join(resourcesDir, "app");
  const standaloneSrc = resolveStandaloneSrc(agentGuiRoot);

  if (existsSync(resourcesDir)) {
    rmSync(resourcesDir, { recursive: true, force: true });
  }
  mkdirSync(appDir, { recursive: true });

  cpSync(standaloneSrc, appDir, { recursive: true });
  stripNestedBundleArtifacts(appDir);

  const staticSrc = join(agentGuiRoot, ".next", "static");
  const staticDst = join(appDir, ".next", "static");
  if (existsSync(staticSrc)) {
    mkdirSync(dirname(staticDst), { recursive: true });
    cpSync(staticSrc, staticDst, { recursive: true });
  }

  const publicSrc = join(agentGuiRoot, "public");
  if (existsSync(publicSrc)) {
    cpSync(publicSrc, join(appDir, "public"), { recursive: true });
  }

  const skillsSrc = join(repoRoot, "docs", "skills");
  const skillsDst = join(appDir, "docs", "skills");
  if (existsSync(skillsSrc)) {
    mkdirSync(dirname(skillsDst), { recursive: true });
    cpSync(skillsSrc, skillsDst, { recursive: true });
  }

  cpSync(join(repoRoot, "version.json"), join(appDir, "version.json"));
  cpSync(join(agentGuiRoot, ".env.example"), join(appDir, ".env.example"));

  const drizzleMigrationsSrc = join(agentGuiRoot, "drizzle", "migrations");
  const drizzleMigrationsDst = join(appDir, "drizzle", "migrations");
  if (!existsSync(drizzleMigrationsSrc)) {
    throw new Error(`Missing Drizzle migrations: ${drizzleMigrationsSrc}`);
  }
  mkdirSync(dirname(drizzleMigrationsDst), { recursive: true });
  cpSync(drizzleMigrationsSrc, drizzleMigrationsDst, { recursive: true });
  console.log(`drizzle migrations staged: ${drizzleMigrationsDst}`);

  prepareBundledLlmRuntime(appDir);
  prepareRemoteCipherPepper(appDir);
  ensureNextStandaloneRuntimes(agentGuiRoot, appDir);
  patchStandaloneServerEntry(appDir);
  stageBrowserRuntime(agentGuiRoot, appDir);

  console.log(`Next standalone staged: ${appDir}`);
}

/** @param {{ resourcesDir: string, voiceMetadataSrc: string }} ctx */
export function stageVoiceResourceFiles(ctx) {
  const { resourcesDir, voiceMetadataSrc } = ctx;
  for (const name of VOICE_RESOURCE_FILES) {
    const src = join(voiceMetadataSrc, name);
    if (!existsSync(src)) {
      throw new Error(`Missing voice plugin metadata: ${src}`);
    }
    cpSync(src, join(resourcesDir, name));
  }
  console.log(`voice plugin metadata staged (${VOICE_RESOURCE_FILES.length} files)`);
}

/** @param {{ resourcesDir: string, repoRoot?: string }} ctx */
export function stageQkrpcRuntime(ctx) {
  const repoRoot = ctx.repoRoot ?? defaultRepoRoot;
  const cliDir = ensureQkrpcCli(repoRoot);
  const dest = join(ctx.resourcesDir, "qkrpc");
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(cliDir, dest, { recursive: true });
  const kestrel = join(dest, "Microsoft.AspNetCore.Server.Kestrel.Core.dll");
  const size = existsSync(kestrel) ? readFileSync(kestrel).length : 0;
  if (size < 100_000) {
    throw new Error(
      `Bundled qkrpc looks corrupt after copy (${kestrel} size=${size}). Re-run publish-rpc.ps1.`,
    );
  }
  console.log(`qkrpc runtime: ${dest}`);
}

/** @param {{ resourcesDir: string, repoRoot?: string }} ctx */
export function ensureBundledNode(ctx) {
  const repoRoot = ctx.repoRoot ?? defaultRepoRoot;
  const nodeDir = join(ctx.resourcesDir, "node");
  const nodeExe = join(nodeDir, process.platform === "win32" ? "node.exe" : "bin/node");
  if (existsSync(nodeExe)) {
    console.log(`Node already staged: ${nodeExe}`);
    return;
  }

  const cacheDir = join(repoRoot, "publish", "cache");
  const zipName = `node-v${NODE_VERSION}-win-x64.zip`;
  const folderName = `node-v${NODE_VERSION}-win-x64`;
  const zipPath = join(cacheDir, zipName);
  const extractedDir = join(cacheDir, folderName);
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${zipName}`;

  mkdirSync(cacheDir, { recursive: true });
  if (!existsSync(zipPath)) {
    console.log(`Downloading Node.js v${NODE_VERSION}...`);
    run("curl", ["-fsSL", url, "-o", zipPath]);
  }
  if (!existsSync(join(extractedDir, "node.exe"))) {
    console.log(`Extracting ${zipName}...`);
    if (existsSync(extractedDir)) rmSync(extractedDir, { recursive: true, force: true });
    run("tar", ["-xf", zipPath, "-C", cacheDir]);
  }

  mkdirSync(nodeDir, { recursive: true });
  cpSync(extractedDir, nodeDir, { recursive: true });
  console.log(`Node staged: ${join(nodeDir, "node.exe")}`);
}

/** @param {{ resourcesDir: string, repoRoot?: string }} ctx */
export function ensureBundledRipgrep(ctx) {
  const repoRoot = ctx.repoRoot ?? defaultRepoRoot;
  const rgDir = join(ctx.resourcesDir, "rg");
  const rgExe = join(rgDir, process.platform === "win32" ? "rg.exe" : "rg");
  if (existsSync(rgExe)) {
    console.log(`ripgrep already staged: ${rgExe}`);
    return;
  }

  if (process.platform !== "win32") {
    console.log("ripgrep staging skipped (non-Windows bundle uses system rg when present)");
    return;
  }

  const cacheDir = join(repoRoot, "publish", "cache");
  const archiveName = `ripgrep-${RIPGREP_VERSION}-x86_64-pc-windows-msvc.zip`;
  const folderName = `ripgrep-${RIPGREP_VERSION}-x86_64-pc-windows-msvc`;
  const zipPath = join(cacheDir, archiveName);
  const extractedDir = join(cacheDir, folderName);
  const url =
    `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/${archiveName}`;

  mkdirSync(cacheDir, { recursive: true });
  if (!existsSync(zipPath)) {
    console.log(`Downloading ripgrep v${RIPGREP_VERSION}...`);
    run("curl", ["-fsSL", url, "-o", zipPath]);
  }
  if (!existsSync(join(extractedDir, "rg.exe"))) {
    console.log(`Extracting ${archiveName}...`);
    if (existsSync(extractedDir)) rmSync(extractedDir, { recursive: true, force: true });
    run("tar", ["-xf", zipPath, "-C", cacheDir]);
  }

  mkdirSync(rgDir, { recursive: true });
  cpSync(join(extractedDir, "rg.exe"), rgExe);
  const completeExe = join(extractedDir, "complete", "rg.exe");
  if (existsSync(completeExe)) {
    cpSync(completeExe, join(rgDir, "rg-complete.exe"));
  }
  console.log(`ripgrep staged: ${rgExe}`);
}

function verifyStagedBundle(agentGuiRoot, resourcesDir, label) {
  const { status } = spawnSync(
    process.execPath,
    [
      join(agentGuiRoot, "scripts", "verify-desktop-bundle.mjs"),
      "--resources-dir",
      resourcesDir,
      "--label",
      label,
    ],
    { stdio: "inherit" },
  );
  if (status !== 0) {
    throw new Error(`verify-desktop-bundle failed after staging (${label})`);
  }
}

/**
 * @param {{
 *   resourcesDir: string,
 *   voiceMetadataSrc: string,
 *   agentGuiRoot?: string,
 *   repoRoot?: string,
 *   label?: string,
 *   verify?: boolean,
 * }} options
 */
export function prepareDesktopBundle(options) {
  const agentGuiRoot = options.agentGuiRoot ?? defaultAgentGuiRoot;
  const ctx = {
    resourcesDir: options.resourcesDir,
    voiceMetadataSrc: options.voiceMetadataSrc,
    agentGuiRoot,
    repoRoot: options.repoRoot ?? defaultRepoRoot,
  };
  const label = options.label ?? "staged";

  stageNextStandalone(ctx);
  stageVoiceResourceFiles(ctx);
  ensureBundledNode(ctx);
  ensureBundledRipgrep(ctx);
  stageQkrpcRuntime(ctx);

  if (options.verify !== false) {
    verifyStagedBundle(agentGuiRoot, ctx.resourcesDir, label);
  }
}
