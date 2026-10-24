import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeRuntimeMode } from "../electron/runtime-mode.mjs";
import { resolveRuntimeEntry } from "../electron/runtime-entry.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseAgentStartArguments(argv) {
  const options = { runtimeMode: "static", development: argv.includes("--dev"), serviceArguments: [] };
  let explicitMode = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg.startsWith("--runtime=") && !explicitMode) { options.runtimeMode = normalizeRuntimeMode(arg.slice(10)); explicitMode = true; }
    else if (arg.startsWith("--app-dir=") && arg.length > 10 && options.appDirectory === undefined) options.appDirectory = resolve(arg.slice(10));
    else if (["--dev", "--webpack", "--open-browser"].includes(arg) && options.development) continue;
    else if (["--host", "--port", "--data-dir"].includes(arg) && argv[index + 1] && !argv[index + 1].startsWith("--")) options.serviceArguments.push(arg, argv[++index]);
    else if (arg === "--help" && !options.development) options.serviceArguments.push(arg);
    else throw new Error(`Unknown Agent start argument ${arg}; use --dev, --runtime=static|legacy-next, --app-dir=<directory>, --host, --port or --data-dir`);
  }
  if (options.development && (explicitMode || options.appDirectory || options.serviceArguments.length)) throw new Error("Development HMR cannot be combined with production runtime/app/profile arguments");
  if (options.runtimeMode === "legacy-next" && options.serviceArguments.length) throw new Error("Legacy Next uses HOSTNAME/PORT and QUICKER_AGENT_DATA_DIR; service CLI flags require static mode");
  return options;
}

/** Select and validate before importing any server, probing ports or starting qkrpc. */
export async function runAgentStart(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseAgentStartArguments(argv), load = dependencies.load ?? ((url) => import(url));
  if (options.development) return load(pathToFileURL(join(root, "start-next.mjs")).href);
  let appDirectory = options.appDirectory;
  if (!appDirectory && options.runtimeMode === "legacy-next") {
    // Raw Next standalone omits public/static assets; use the complete staged app.
    appDirectory = join(root, "electron/resources/app");
  }
  appDirectory ??= resolve(root, "../.tmp/static-runtime/app");
  const entry = resolveRuntimeEntry(appDirectory, { mode: options.runtimeMode });
  const environment = dependencies.environment ?? process.env;
  environment.NODE_ENV = "production";
  if (entry.kind === "legacy-next") environment.HOSTNAME = environment.HOSTNAME?.trim() || "127.0.0.1";
  const applyArguments = dependencies.applyArguments ?? ((path, args) => { process.argv = [process.execPath, path, ...args]; });
  applyArguments(entry.path, options.serviceArguments);
  return load(pathToFileURL(entry.path).href);
}
