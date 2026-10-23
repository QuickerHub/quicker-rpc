import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStaticRuntime } from "./build-static-runtime.mjs";
import { ensureBundledNode, ensureBundledRipgrep, rebuildBetterSqlite3ForBundledNode, stageQkrpcRuntime, readDesktopBundleSemver } from "./desktop-bundle-prepare.mjs";
import { stageElectronShell } from "./electron-shell-staging.mjs";
import { generateElectronInstallerAssets } from "./generate-electron-installer-assets.mjs";
import { verifyStaticRuntime } from "./verify-static-runtime.mjs";
import { prepareBundledLlmRuntime } from "./embed-bundled-llm-secrets.mjs";
import { prepareRemoteCipherPepper } from "./embed-remote-cipher-pepper.mjs";

const agentGuiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(agentGuiRoot, "..");
const resourcesDir = join(agentGuiRoot, "electron/resources");
const ctx = { resourcesDir, agentGuiRoot, repoRoot };
await buildStaticRuntime({ outputDirectory: join(resourcesDir, "app"), allowOutput: true });
prepareBundledLlmRuntime(join(resourcesDir, "app"));
prepareRemoteCipherPepper(join(resourcesDir, "app"));
ensureBundledNode(ctx);
rebuildBetterSqlite3ForBundledNode(resourcesDir, agentGuiRoot);
ensureBundledRipgrep(ctx);
// An explicit offline CLI build can be supplied without installing or restarting it.
const qkrpcDirectory = process.env.STATIC_RUNTIME_QKRPC_DIR;
if (qkrpcDirectory) {
  if (!existsSync(join(qkrpcDirectory, "qkrpc.exe"))) throw new Error("STATIC_RUNTIME_QKRPC_DIR has no qkrpc.exe");
  mkdirSync(join(resourcesDir, "qkrpc"), { recursive: true });
  cpSync(qkrpcDirectory, join(resourcesDir, "qkrpc"), { recursive: true });
} else stageQkrpcRuntime(ctx);
await verifyStaticRuntime(join(resourcesDir, "app"), { nodeExecutable: join(resourcesDir, "node/node.exe"), desktop: true });
await generateElectronInstallerAssets({ regenFromSvg: false });
stageElectronShell({ version: readDesktopBundleSemver(repoRoot) });
console.log("Static Agent runtime staged for Electron; installer/upgrade acceptance is separate.");
