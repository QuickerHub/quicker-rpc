import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
// Use the installed compiler already used by tsx; this does not load Agent code.
const { build } = createRequire(require.resolve("tsx"))("esbuild");

const entryPoints = [
  "service/main.ts",
  "lib/agent-harness/run-turn.server.ts",
  "lib/browser-runtime-start.server.ts",
  "lib/terminal-runtime-start.server.ts",
];

// createRequire(import.meta.url) is intentionally opaque to esbuild. Audit these
// known local loads as supplemental entries; deployment must preserve their layout.
const runtimeLocalModules = [
  "lib/qkrpc-bin.mjs",
  "lib/rg-bin.mjs",
  "lib/qkrpc-toolchain-env.mjs",
];

/** Compile to memory only. No generated module, config, database or model is loaded. */
export async function inspectAgentBackendDependencies(options = {}) {
  const markerImporters = new Set();
  const result = await build({
    absWorkingDir: agentGuiRoot,
    entryPoints: options.entryPoints ?? [...entryPoints, ...runtimeLocalModules],
    ...(options.stdin ? { stdin: { resolveDir: agentGuiRoot, ...options.stdin } } : {}),
    outdir: ".tmp/backend-dependency-check",
    bundle: true,
    packages: "external",
    platform: "node",
    target: "node20",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
    plugins: [{
      name: "agent-backend-server-only-marker",
      setup(compiler) {
        compiler.onResolve({ filter: /^server-only$/ }, (args) => {
          markerImporters.add(args.importer);
          return { path: "server-only", namespace: "agent-backend-marker" };
        });
        // This marker is a Next client-import guard, not a Node runtime package.
        // Only this explicit backend compilation removes it; Next keeps its guard.
        compiler.onLoad({ filter: /.*/, namespace: "agent-backend-marker" }, () => ({ contents: "", loader: "js" }));
      },
    }],
  });
  const inputs = Object.entries(result.metafile.inputs);
  const outputs = Object.values(result.metafile.outputs);
  const nextImports = inputs.flatMap(([source, info]) => info.imports
    .filter((item) => /^next(?:\/|$)/.test(item.path))
    .map((item) => `${source} -> ${item.path}`));
  if (nextImports.length) throw new Error(`Agent backend imports Next:\n${nextImports.join("\n")}`);
  const externalImports = [...new Set(outputs.flatMap((info) => info.imports
    .filter((item) => item.external).map((item) => item.path)))].sort();
  const unresolved = externalImports.filter((path) => path === "server-only" || path.startsWith("@/") || /^next(?:\/|$)/.test(path));
  if (unresolved.length) throw new Error(`Agent backend has unresolved framework/local imports: ${unresolved.join(", ")}`);
  return {
    ok: true,
    inputCount: inputs.length,
    outputCount: outputs.length,
    serverOnlyMarkerImporters: markerImporters.size,
    nextImports,
    externalPackages: externalImports.filter((path) => !path.startsWith("node:")),
    nativeExternalPackages: externalImports.filter((path) => /^(better-sqlite3|node-pty)(?:\/|$)|\.node$/.test(path)),
    runtimeLocalModules,
    limitations: [
      "Static local-source graph only; external npm packages are not bundled or audited internally.",
      "server-only markers are removed only in this backend compilation. No output is written or executed.",
      "createRequire relative modules and import.meta.url paths require preserved source layout or explicit resource mapping.",
      "Runtime composition must supply app/cwd roots, SQL migrations, docs/skills/knowledge assets and qkrpc/browser/terminal runtimes.",
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await inspectAgentBackendDependencies(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
