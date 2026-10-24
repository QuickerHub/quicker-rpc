import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stageRuntimePackages } from "./stage-runtime-packages.mjs";
export { stageRuntimePackages } from "./stage-runtime-packages.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("tsx"))("esbuild");
const marker = { name: "node-server-marker", setup(compiler) {
  compiler.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "marker" }));
  compiler.onLoad({ filter: /.*/, namespace: "marker" }, () => ({ contents: "", loader: "js" }));
  // Iconify's extensionless CJS subpaths cannot be loaded as external Node ESM.
  compiler.onResolve({ filter: /^@iconify\/icons-mdi\// }, (args) => ({ path: require.resolve(args.path) }));
} };
const packageName = (specifier) => specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];

export async function buildStaticRuntime({ outputDirectory = resolve(root, "../.tmp/static-runtime/app"), development = false, allowOutput = false } = {}) {
  const target = resolve(outputDirectory);
  const repository = resolve(root, "..");
  const temporaryRoot = join(repository, ".tmp");
  const within = (base, path) => { const rel = relative(base, path); return rel && rel !== ".." && !rel.startsWith("..\\") && !rel.startsWith("../") && !isAbsolute(rel); };
  if (!within(repository, target) || target === root || !allowOutput && !within(temporaryRoot, target)) {
    throw new Error("Output must be a dedicated repository .tmp directory (or explicitly --allow-output inside this repository)");
  }
  const manifestPath = join(target, "runtime-manifest.json");
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : undefined;
  const known = previous?.format === "quicker-agent-static-runtime" && previous.version === 1
    || target === join(root, "electron/resources/app") && existsSync(join(target, "server.js")) && existsSync(join(target, ".next/BUILD_ID"));
  if (existsSync(target) && !known) throw new Error(`Refusing to replace an unrecognized runtime directory: ${target}`);
  for (const file of ["agent.db", ".local", "agent.db.writer.sqlite"]) {
    if (existsSync(join(target, file))) throw new Error(`Refusing to replace runtime containing user data: ${file}`);
  }
  mkdirSync(temporaryRoot, { recursive: true });
  const staging = mkdtempSync(join(temporaryRoot, "static-runtime-stage-"));
  const stagedApp = join(staging, "app");
  const report = await buildInto(stagedApp, development);
  mkdirSync(dirname(target), { recursive: true });
  const backup = join(staging, "previous-app");
  if (existsSync(target)) renameSync(target, backup);
  try { renameSync(stagedApp, target); }
  catch (error) { if (existsSync(backup)) renameSync(backup, target); throw error; }
  // Both paths are generated beneath the verified repository .tmp root.
  if (!within(temporaryRoot, staging)) throw new Error("Invalid staging cleanup root");
  rmSync(staging, { recursive: true, force: true });
  return { ...report, appDirectory: target };
}

async function buildInto(appDirectory, development) {
  mkdirSync(appDirectory, { recursive: true });
  const renderer = join(appDirectory, "renderer");
  mkdirSync(renderer, { recursive: true });
  const client = await build({
    absWorkingDir: root, entryPoints: ["renderer/main.tsx"], outdir: renderer,
    entryNames: "assets/[name]-[hash]", chunkNames: "assets/[name]-[hash]", assetNames: "assets/[name]-[hash]",
    bundle: true, splitting: true, format: "esm", platform: "browser", target: "es2022", jsx: "automatic",
    minify: !development, metafile: true, define: {
      "process.env.NODE_ENV": JSON.stringify(development ? "development" : "production"),
      "process.env": "{}",
    }, loader: { ".svg": "file", ".png": "file", ".woff2": "file", ".ttf": "file" },
  });
  const clientInputs = Object.keys(client.metafile.inputs);
  if (clientInputs.some((file) => /node_modules[\\/]next[\\/]|\.server\.[tm]?[js]|lib[\\/]db[\\/]/.test(file))) {
    throw new Error("Renderer imports a server or Next module");
  }
  const output = Object.entries(client.metafile.outputs).find(([, info]) => info.entryPoint === "renderer/main.tsx");
  if (!output) throw new Error("Renderer entry missing");
  const url = (file) => `/${relative(renderer, resolve(root, file)).replaceAll("\\", "/")}`;
  const css = [...new Set(Object.values(client.metafile.outputs).map((info) => info.cssBundle).filter(Boolean))];
  const { THEME_INIT_SCRIPT } = await import("../lib/theme-constants.ts");
  const { SIDEBAR_INIT_SCRIPT } = await import("../lib/sidebar-prefs.ts");
  const { RELEASE_PREVIEW_INIT_SCRIPT } = await import("../lib/release-preview-constants.ts");
  const splash = await import("../lib/app-bootstrap-splash-markup.ts");
  const { LAUNCHER_SHELL_INIT_SCRIPT } = await import("../lib/launcher/launcher-shell-init.ts");
  writeFileSync(join(renderer, "index.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>QuickerAgent</title>${[THEME_INIT_SCRIPT, SIDEBAR_INIT_SCRIPT, RELEASE_PREVIEW_INIT_SCRIPT, splash.APP_BOOTSTRAP_SPLASH_INIT_SCRIPT, splash.APP_BOOTSTRAP_SPLASH_DISMISS_SCRIPT, `if(location.pathname === "/launcher") { ${LAUNCHER_SHELL_INIT_SCRIPT} }`].map((script) => `<script>${script}</script>`).join("")}${css.map((file) => `<link rel="stylesheet" href="${url(file)}">`).join("")}</head><body>${splash.APP_BOOTSTRAP_SPLASH_MARKUP}<div id="root"></div><script type="module" src="${url(output[0])}"></script></body></html>`);
  if (existsSync(join(root, "public"))) cpSync(join(root, "public"), renderer, { recursive: true });
  const helperNames = ["qkrpc-bin", "rg-bin", "qkrpc-toolchain-env", "qkrpc-serve-lifecycle", "browser-runtime-lifecycle", "terminal-runtime-lifecycle", "agent-data-profile"];
  const backend = await build({
    absWorkingDir: root,
    entryPoints: { "service-main": "service/main.ts", ...Object.fromEntries(helperNames.map((name) => [name, `lib/${name}.mjs`])) },
    outdir: join(appDirectory, "lib"), outExtension: { ".js": ".mjs" },
    bundle: true, packages: "external", platform: "node", target: "node22", format: "esm", metafile: true, plugins: [marker],
  });
  const externals = new Set(Object.values(backend.metafile.outputs).flatMap((info) => info.imports.filter((item) => item.external).map((item) => item.path)));
  if ([...externals].some((name) => /^next(?:\/|$)|^@\/|^server-only$/.test(name))) throw new Error("Backend retains framework imports");
  // The copied runtime sources keep their own resolver contexts. Parse their
  // graph with the same compiler, without writing or executing another runtime.
  const runtimeAnalysis = await build({ absWorkingDir: root, entryPoints: ["browser-runtime/server.mjs", "terminal-runtime/server.mjs"],
    outdir: join(appDirectory, "runtime-analysis"), bundle: true, packages: "external", platform: "node", target: "node22", format: "esm", write: false, metafile: true });
  const imports = new Map();
  function recordImport(item, from) {
    if (!item.external || isBuiltin(item.path) || item.path.startsWith(".")) return;
    const entry = { specifier: item.path, from: from.replaceAll("\\", "/"), mode: ["require-call", "require-resolve"].includes(item.kind) ? "require" : "import" };
    imports.set(JSON.stringify(entry), entry);
  }
  for (const [file, info] of Object.entries(backend.metafile.outputs))
    for (const item of info.imports) recordImport(item, relative(appDirectory, dirname(resolve(root, file))));
  for (const [file, info] of Object.entries(runtimeAnalysis.metafile.inputs))
    for (const item of info.imports) recordImport(item, relative(root, dirname(resolve(root, file))));
  const runtimeImports = [...imports.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const packages = new Set(runtimeImports.map((entry) => packageName(entry.specifier)));
  for (const name of ["playwright", "ws", "node-pty"]) packages.add(name);
  const packageCount = stageRuntimePackages(packages, appDirectory);
  for (const directory of ["browser-runtime", "terminal-runtime", "drizzle/migrations", "lib/agent-defs/bundled"]) {
    cpSync(join(root, directory), join(appDirectory, directory), { recursive: true, filter: (path) => !/\.test\.[cm]?[jt]s$/.test(path) });
  }
  for (const directory of ["docs/skills", "docs/authoring-references", "docs/knowledge"]) {
    if (existsSync(join(root, "..", directory))) cpSync(join(root, "..", directory), join(appDirectory, directory), { recursive: true });
  }
  cpSync(join(root, "../QuickerRpc/version.json"), join(appDirectory, "version.json"));
  writeFileSync(join(appDirectory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  writeFileSync(join(appDirectory, "service.mjs"), `import { dirname, join } from 'node:path';\nimport { fileURLToPath } from 'node:url';\nconst root = dirname(fileURLToPath(import.meta.url));\nprocess.chdir(root);\nprocess.env.AGENT_GUI_ROOT = root;\nif (!process.argv.includes('--renderer-dir')) process.argv.push('--renderer-dir', join(root, 'renderer'));\nawait import('./lib/service-main.mjs');\n`);
  const rendererFiles = Object.keys(client.metafile.outputs).map((file) => relative(renderer, resolve(root, file)).replaceAll("\\", "/")).sort();
  const { agentApiRoutes } = await import("../lib/agent-service/api-routes.generated.ts");
  const report = { format: "quicker-agent-static-runtime", version: 1, routeCount: agentApiRoutes.length + 1, handlerRouteCount: agentApiRoutes.length, rendererInputs: clientInputs.length, serviceInputs: Object.keys(backend.metafile.inputs).length, packageCount, runtimePackageRoots: [...packages].sort(), runtimeImports, rendererFiles, next: false };
  writeFileSync(join(appDirectory, "runtime-manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void buildStaticRuntime({ outputDirectory: process.argv.find((arg) => arg.startsWith("--out="))?.slice(6), development: process.argv.includes("--dev"), allowOutput: process.argv.includes("--allow-output") }).then((report) => console.log(JSON.stringify(report, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
