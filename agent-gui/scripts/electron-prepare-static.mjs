import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgentProductionRuntime } from "./build-agent-production.mjs";
import { ensureBundledNode, ensureBundledRipgrep, rebuildBetterSqlite3ForBundledNode, stageQkrpcRuntime } from "./desktop-bundle-prepare.mjs";
import { verifyStaticRuntime } from "./verify-static-runtime.mjs";
import { prepareBundledLlmRuntime } from "./embed-bundled-llm-secrets.mjs";
import { prepareRemoteCipherPepper } from "./embed-remote-cipher-pepper.mjs";
import { resolveRuntimeEntry } from "../electron/runtime-entry.mjs";
import { writeRuntimeMode } from "../electron/runtime-mode.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function prepareStaticElectronBundle(options = {}, dependencies = {}) {
  const agentGuiRoot = options.agentGuiRoot ?? root, repoRoot = options.repoRoot ?? resolve(agentGuiRoot, "..");
  const resourcesDir = options.resourcesDir ?? join(agentGuiRoot, "electron/resources");
  const ctx = { resourcesDir, agentGuiRoot, repoRoot }, appDirectory = join(resourcesDir, "app");
  if (options.reuseApp) {
    if (resolveRuntimeEntry(appDirectory).kind !== "static") throw new Error(`Cannot reuse ${appDirectory}: requested static but staged runtime selects legacy-next`);
  } else {
    await (dependencies.buildProductionRuntime ?? buildAgentProductionRuntime)({ outputDirectory: appDirectory, allowOutput: true });
  }
  (dependencies.prepareBundledLlmRuntime ?? prepareBundledLlmRuntime)(appDirectory);
  (dependencies.prepareRemoteCipherPepper ?? prepareRemoteCipherPepper)(appDirectory);
  (dependencies.ensureBundledNode ?? ensureBundledNode)(ctx);
  (dependencies.rebuildNative ?? rebuildBetterSqlite3ForBundledNode)(resourcesDir, agentGuiRoot);
  (dependencies.ensureBundledRipgrep ?? ensureBundledRipgrep)(ctx);
  const qkrpcDirectory = options.qkrpcDirectory ?? process.env.STATIC_RUNTIME_QKRPC_DIR;
  if (qkrpcDirectory) {
    if (!existsSync(join(qkrpcDirectory, "qkrpc.exe"))) throw new Error(`STATIC_RUNTIME_QKRPC_DIR has no qkrpc.exe: ${qkrpcDirectory}`);
    mkdirSync(join(resourcesDir, "qkrpc"), { recursive: true });
    cpSync(qkrpcDirectory, join(resourcesDir, "qkrpc"), { recursive: true });
  } else (dependencies.stageQkrpcRuntime ?? stageQkrpcRuntime)(ctx);
  await (dependencies.verifyStaticRuntime ?? verifyStaticRuntime)(appDirectory, { nodeExecutable: join(resourcesDir, "node/node.exe"), desktop: true });
  writeRuntimeMode(appDirectory, "static");
  return { ...ctx, appDirectory, mode: "static" };
}

// Preserve the former explicit static entry while sharing the default prepare flow.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  import("./electron-prepare.mjs").then(({ runElectronPrepare }) => runElectronPrepare(["--runtime=static", ...process.argv.slice(2)]))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
