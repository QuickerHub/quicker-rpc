import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStaticRuntime } from "./build-static-runtime.mjs";
import { writeRuntimeMode } from "../electron/runtime-mode.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), require = createRequire(import.meta.url);

export function parseProductionBuildArguments(argv) {
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith("--out=") && arg.length > 6 && options.outputDirectory === undefined) options.outputDirectory = arg.slice(6);
    else if (arg === "--allow-output" && options.allowOutput === undefined) options.allowOutput = true;
    else throw new Error(`Unknown production build argument ${arg}; use --out=<directory> (legacy: pnpm build:legacy-next)`);
  }
  return options;
}

function runBuildStep(command, args, options) {
  const result = spawnSync(command, args, { ...options, stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error(`Production build check failed: ${args[0]} (exit ${result.status ?? result.signal ?? "unknown"})`, { cause: result.error });
}

/** Default production builds retain the checks formerly provided by Next build. */
export async function buildAgentProductionRuntime(options = {}, dependencies = {}) {
  const run = dependencies.run ?? runBuildStep;
  console.log("Production build: docs, API manifest and TypeScript checks...");
  run(process.execPath, [join(root, "../scripts/generate-authoring-docs.mjs")], { cwd: root });
  run(process.execPath, [join(root, "scripts/generate-service-routes.mjs"), "--check"], { cwd: root });
  run(process.execPath, [require.resolve("typescript/lib/tsc.js"), "--noEmit", "--incremental", "false"], { cwd: root });
  console.log("Production build: static renderer and independent Node service...");
  const report = await (dependencies.buildStaticRuntime ?? buildStaticRuntime)(options);
  writeRuntimeMode(report.appDirectory, "static");
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => buildAgentProductionRuntime(parseProductionBuildArguments(process.argv.slice(2))))
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
