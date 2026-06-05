/**
 * Stage Next standalone + qkrpc + portable Node for Tauri bundle (resources/ + bin/).
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

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(agentGuiRoot, "..");
const tauriRoot = join(agentGuiRoot, "src-tauri");
const resourcesDir = join(tauriRoot, "resources");
const appDir = join(resourcesDir, "app");
const voiceMetadataSrc = join(tauriRoot, "voice-plugin-metadata");

const VOICE_RESOURCE_FILES = [
  "voice-plugin-manifest.json",
  "voice-plugin-channel.json",
  "voice-sensevoice-model-identity.json",
];

function stageVoiceResourceFiles() {
  for (const name of VOICE_RESOURCE_FILES) {
    const src = join(voiceMetadataSrc, name);
    if (!existsSync(src)) {
      throw new Error(`Missing voice plugin metadata: ${src}`);
    }
    cpSync(src, join(resourcesDir, name));
  }
  console.log(`voice plugin metadata staged (${VOICE_RESOURCE_FILES.length} files)`);
}

const NODE_VERSION = process.env.TAURI_NODE_VERSION ?? "22.14.0";

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

function readSemver() {
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

function ensureQkrpcCli() {
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

function stageQkrpcRuntime() {
  const cliDir = ensureQkrpcCli();
  const dest = join(resourcesDir, "qkrpc");
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(cliDir, dest, { recursive: true });
  console.log(`qkrpc runtime: ${dest}`);
}

function ensureBundledNode() {
  const nodeDir = join(resourcesDir, "node");
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

function resolveStandaloneSrc() {
  const base = join(agentGuiRoot, ".next", "standalone");
  const direct = join(base, "server.js");
  if (existsSync(direct)) return base;
  // outputFileTracingRoot (monorepo) nests standalone under agent-gui/
  const nested = join(base, "agent-gui", "server.js");
  if (existsSync(nested)) return join(base, "agent-gui");
  throw new Error(`Run pnpm build first. Missing standalone server.js under ${base}`);
}

function stripNestedBundleArtifacts(appRoot) {
  const nested = join(appRoot, "src-tauri");
  if (existsSync(nested)) {
    rmSync(nested, { recursive: true, force: true });
    console.log(`Removed traced src-tauri from staged app: ${nested}`);
  }
}

function stageNextStandalone() {
  const standaloneSrc = resolveStandaloneSrc();

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

  const docsSrc = join(repoRoot, "docs", "skills", "quicker-authoring");
  const docsDst = join(appDir, "docs", "skills", "quicker-authoring");
  if (existsSync(docsSrc)) {
    mkdirSync(dirname(docsDst), { recursive: true });
    cpSync(docsSrc, docsDst, { recursive: true });
  }

  cpSync(join(repoRoot, "version.json"), join(appDir, "version.json"));
  cpSync(join(agentGuiRoot, ".env.example"), join(appDir, ".env.example"));

  prepareBundledLlmRuntime(appDir);

  console.log(`Next standalone staged: ${appDir}`);
}

function syncTauriVersion() {
  const version = readSemver();
  const confPath = join(tauriRoot, "tauri.conf.json");
  const conf = JSON.parse(readFileSync(confPath, "utf8"));
  conf.version = version;
  writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`, "utf8");
  console.log(`tauri.conf.json version -> ${version}`);
}

function verifyStagedBundle() {
  const { status } = spawnSync(
    process.execPath,
    [join(agentGuiRoot, "scripts", "verify-tauri-bundle.mjs")],
    { stdio: "inherit" },
  );
  if (status !== 0) {
    throw new Error("verify-tauri-bundle failed after staging");
  }
}

function clearStaleBundledResources() {
  const bundled = join(tauriRoot, "target", "release", "resources");
  if (existsSync(bundled)) {
    rmSync(bundled, { recursive: true, force: true });
    console.log(`Removed stale bundled resources: ${bundled}`);
  }
}

function main() {
  console.log("tauri-prepare: staging runtime for Tauri bundle...");
  clearStaleBundledResources();
  stageNextStandalone();
  stageVoiceResourceFiles();
  ensureBundledNode();
  stageQkrpcRuntime();
  syncTauriVersion();
  verifyStagedBundle();
  console.log("tauri-prepare: done.");
}

main();
