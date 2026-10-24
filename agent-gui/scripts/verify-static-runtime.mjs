import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyRuntimeDependencyGraph } from "./static-runtime-dependency-graph.mjs";
import { STATIC_RUNTIME_NATIVE_CONTEXTS } from "./static-runtime-native-probe.mjs";

const required = ["package.json", "service.mjs", "lib/service-main.mjs", "renderer/index.html", "drizzle/migrations/meta/_journal.json", "docs/skills/quicker-authoring/SKILL.md", "docs/skills/quicker-eval-expression/SKILL.md", "browser-runtime/server.mjs", "terminal-runtime/server.mjs", "lib/qkrpc-bin.mjs", "lib/qkrpc-toolchain-env.mjs"];
const isOutside = (path) => path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);

function contained(root, path) {
  const canonical = realpathSync(path);
  if (isOutside(relative(root, canonical))) throw new Error(`Runtime resource escapes its directory: ${path}`);
  return canonical;
}

function requiredFile(root, file) {
  const path = join(root, file);
  if (!existsSync(path)) throw new Error(`Missing static runtime resource: ${file}`);
  contained(root, path);
  if (!statSync(path).isFile()) throw new Error(`Static runtime resource is not a file: ${file}`);
  return path;
}

/** Inspect before any dependency code runs, including manifest and HTML reads. */
export function inspectStaticRuntime(appDirectory) {
  const root = realpathSync(appDirectory), visited = new Set();
  let files = 0;
  function inspect(directory) {
    const canonical = contained(root, directory);
    if (visited.has(canonical)) return;
    visited.add(canonical);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      contained(root, path);
      if (entry.isSymbolicLink() && isAbsolute(readlinkSync(path))) throw new Error(`Runtime contains a non-relocatable absolute link: ${path}`);
      const info = statSync(path);
      if (info.isDirectory()) inspect(path);
      else if (info.isFile()) files++;
      else throw new Error(`Unsupported runtime resource: ${path}`);
    }
  }
  inspect(root);
  for (const file of required) requiredFile(root, file);
  for (const file of ["node_modules/next", ".next", "server.js", "llm-publish.config.json", ".local", "agent.db"]) {
    if (existsSync(join(root, file))) throw new Error(`Unexpected private or Next resource: ${file}`);
  }
  const manifest = JSON.parse(readFileSync(join(root, "runtime-manifest.json"), "utf8"));
  if (manifest.format !== "quicker-agent-static-runtime" || manifest.version !== 1 || manifest.next !== false) throw new Error("Invalid static runtime manifest");
  if (!Array.isArray(manifest.runtimePackageRoots) || !manifest.runtimePackageRoots.length)
    throw new Error("Static runtime has no dependency roots; rebuild it before closure verification");
  if (!Array.isArray(manifest.runtimeImports) || !manifest.runtimeImports.length || manifest.runtimeImports.some((entry) => !entry || typeof entry.specifier !== "string" || !entry.specifier
      || typeof entry.from !== "string" || isAbsolute(entry.from) || entry.from.includes("\\") || isOutside(relative(root, resolve(root, entry.from))) || !["import", "require"].includes(entry.mode)))
    throw new Error("Static runtime has no generated import specifiers; rebuild it before closure verification");
  const renderer = join(root, "renderer"), assets = [];
  let moduleEntries = 0;
  if (!Array.isArray(manifest.rendererFiles) || !manifest.rendererFiles.length) throw new Error("Static runtime has no generated renderer file inventory; rebuild it");
  for (const file of manifest.rendererFiles) {
    if (typeof file !== "string" || isAbsolute(file) || file.includes("\\") || isOutside(relative(renderer, resolve(renderer, file))))
      throw new Error(`Invalid generated renderer file: ${file}`);
    requiredFile(renderer, file);
  }
  const html = readFileSync(join(renderer, "index.html"), "utf8");
  for (const [, tag, attributes] of html.matchAll(/<(script|link)\b([^>]*?)>/gi)) {
    if (tag.toLowerCase() === "link" && !/\brel\s*=\s*["'][^"']*\bstylesheet\b[^"']*["']/i.test(attributes)) continue;
    const reference = new RegExp(`\\b${tag.toLowerCase() === "script" ? "src" : "href"}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
    if (!reference) continue;
    const url = new URL(reference, "http://static-runtime.invalid/");
    const pathname = decodeURIComponent(url.pathname);
    if (url.origin !== "http://static-runtime.invalid" || pathname.includes("\\") || pathname.includes("\0")) throw new Error(`Invalid renderer asset reference: ${reference}`);
    const path = resolve(renderer, "." + pathname);
    if (isOutside(relative(renderer, path))) throw new Error(`Renderer asset escapes its directory: ${reference}`);
    requiredFile(renderer, relative(renderer, path));
    assets.push(reference);
    if (tag.toLowerCase() === "script" && /\btype\s*=\s*["']module["']/i.test(attributes)) moduleEntries++;
  }
  if (!moduleEntries) throw new Error("Static renderer has no module script entry");
  return { root, manifest, files, rendererAssets: assets };
}

export function createNativeProbeEnvironment(profile, source = process.env) {
  const env = { ...source };
  for (const name of Object.keys(env)) if (/^NODE_(?:PATH|OPTIONS)$/i.test(name)) delete env[name];
  for (const name of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "QUICKER_AGENT_DATA_DIR"]) env[name] = profile;
  return { ...env, NODE_ENV: "production", AGENT_GUI_SKIP_QKRPC: "1", AGENT_GUI_SKIP_BROWSER_RUNTIME: "1", AGENT_GUI_SKIP_TERMINAL_RUNTIME: "1", BUNDLED_LLM_REMOTE_CONFIG_DISABLED: "1" };
}

export async function verifyStaticRuntime(appDirectory, { nodeExecutable = process.execPath, desktop = false } = {}) {
  const { root, manifest, files, rendererAssets } = inspectStaticRuntime(appDirectory);
  const entrypoints = manifest.runtimeImports.map(({ specifier, from }) => ({
    name: specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0], from: resolve(root, from),
  }));
  for (const [name, directory] of Object.entries(STATIC_RUNTIME_NATIVE_CONTEXTS))
    if (manifest.runtimePackageRoots.includes(name)) entrypoints.push({ name, from: join(root, directory) });
  const dependencies = verifyRuntimeDependencyGraph(root, manifest.runtimePackageRoots, entrypoints);
  if (!isAbsolute(nodeExecutable)) throw new Error("Static runtime verification requires an absolute Node executable");
  if (desktop) {
    for (const file of ["qkrpc/qkrpc.exe", "rg/rg.exe"]) requiredFile(dirname(root), file);
  }
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const temporary = join(repository, ".tmp");
  mkdirSync(temporary, { recursive: true });
  if (lstatSync(temporary).isSymbolicLink() || relative(temporary, realpathSync(temporary))) throw new Error("Unsafe static runtime probe temporary directory");
  const profile = mkdtempSync(join(temporary, "static-runtime-probe-"));
  try {
    const env = createNativeProbeEnvironment(profile);
    // Load trusted source in plain Node; a parent loader may inject helpers into function.toString().
    const probeUrl = new URL("./static-runtime-native-probe.mjs", import.meta.url).href;
    const importsSource = `import { createRequire } from 'node:module'; import { probeStaticRuntimeImports } from ${JSON.stringify(probeUrl)}; const require = createRequire(import.meta.url); try { console.log(JSON.stringify(probeStaticRuntimeImports(process.argv[1], JSON.parse(require('node:fs').readFileSync(0, 'utf8')), require, (name, parent) => import.meta.resolve(name, parent)))); } catch (error) { console.error(error.stack ?? String(error)); process.exitCode = 1; }`;
    const requests = [...(dependencies.importRequests ?? []), ...manifest.runtimeImports.map((entry) => ({ ...entry, from: resolve(root, entry.from) }))];
    const importsResult = spawnSync(nodeExecutable, ["--experimental-import-meta-resolve", "--input-type=module", "-e", importsSource, root], { cwd: root, env, input: JSON.stringify(requests), encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    if (importsResult.error || importsResult.signal || importsResult.status !== 0) throw new Error(`Runtime import resolution failed: ${importsResult.stderr || importsResult.error || importsResult.signal || importsResult.status}`);
    let importsReport;
    try { importsReport = JSON.parse(importsResult.stdout); } catch { throw new Error("Invalid runtime import resolution report"); }
    if (importsReport.ok !== true || !importsReport.imports?.length) throw new Error("Runtime import resolution returned no file paths");
    for (const entry of importsReport.imports) contained(root, entry.path);
    const source = `import(${JSON.stringify(probeUrl)}).then(({ probeStaticRuntimeNative, STATIC_RUNTIME_NATIVE_CONTEXTS }) => { console.log(JSON.stringify(probeStaticRuntimeNative(process.argv[1], require, STATIC_RUNTIME_NATIVE_CONTEXTS))); }).catch((error) => { console.error(error.stack ?? String(error)); process.exitCode = 1; });`;
    const result = spawnSync(nodeExecutable, ["-e", source, root], { cwd: root, env, encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    if (result.error || result.signal || result.status !== 0) throw new Error(`Native runtime failed: ${result.stderr || result.error || result.signal || result.status}`);
    let nativeReport;
    try { nativeReport = JSON.parse(result.stdout); } catch { throw new Error(`Invalid native runtime probe report: ${result.stdout}`); }
    if (nativeReport.ok !== true || !nativeReport.nativeAddons?.length) throw new Error("Native runtime probe did not load real addons");
    for (const module of [...nativeReport.modules, ...nativeReport.nativeAddons]) contained(root, module.path);
    return { ok: true, files, rendererAssets, dependencies, importsReport, native: "sqlite/pty/ws/playwright loaded", nativeReport, next: false };
  } finally {
    if (isOutside(relative(temporary, realpathSync(profile))) || lstatSync(profile).isSymbolicLink()) throw new Error("Unsafe native probe profile cleanup");
    rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void verifyStaticRuntime(resolve(process.argv[2])).then((report) => console.log(JSON.stringify(report, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
