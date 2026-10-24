import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, open, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RUNTIME_MODE_FILE } from "../../agent-gui/electron/runtime-mode.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const metadataScript = join(repository, "agent-gui/scripts/Assert-NsisFixturePaths.ps1");
const samePath = (left, right) => process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
const writeJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n");

function inspectWindowsMetadata(paths) {
  if (process.platform !== "win32") return;
  // Only exact path/ancestor metadata; never request a recursive source-tree scan.
  const result = spawnSync("pwsh", ["-NoProfile", "-File", metadataScript, "-PathsJson", JSON.stringify(paths)], {
    windowsHide: true, encoding: "utf8", timeout: 30_000,
  });
  if (result.error || result.status !== 0) throw new Error(`Static closure metadata rejected: ${result.error?.message || result.stderr || result.stdout || `exit ${result.status}`}`);
}

async function inspectAncestors(path, inspectPaths) {
  if (/(?:^|[/\\])(?:OneDrive[^/\\]*|Dropbox|iCloud[^/\\]*)(?:[/\\]|$)/i.test(path)) {
    throw new Error("Static closure output cannot use cloud sync directories");
  }
  await inspectPaths([path]);
  for (let cursor = path; ; cursor = dirname(cursor)) {
    try {
      if ((await lstat(cursor)).isSymbolicLink()) throw new Error(`Static closure path is redirected: ${cursor}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (dirname(cursor) === cursor) break;
  }
}

async function checkDirectory(path, inspectPaths) {
  await inspectAncestors(path, inspectPaths);
  if (!(await lstat(path)).isDirectory()) throw new Error(`Static closure path is not a directory: ${path}`);
  const canonical = await realpath(path);
  if (!samePath(canonical, path)) throw new Error(`Static closure directory changed its canonical target: ${path}`);
  return canonical;
}

async function ownedDirectory(parent, name, inspectPaths) {
  const path = join(parent, name);
  await inspectAncestors(path, inspectPaths);
  try { await mkdir(path); } catch (error) { if (error.code !== "EEXIST") throw error; }
  return checkDirectory(path, inspectPaths);
}

const productionEntry = "agent-gui/scripts/build-agent-production.mjs";
const productionBuild = async (options) => (await import("../../agent-gui/scripts/build-agent-production.mjs")).buildAgentProductionRuntime(options);
const productionVerify = async (path, options) => (await import("../../agent-gui/scripts/verify-static-runtime.mjs")).verifyStaticRuntime(path, options);
const snapshot = (info) => [info.ino, info.mode, info.nlink, info.size, info.mtimeNs, info.ctimeNs, info.birthtimeNs].map(String).join(":");
const sameSnapshot = (left, right) => snapshot(left) === snapshot(right)
  && (left.dev === right.dev || process.platform === "win32" && (left.dev === 0n || right.dev === 0n));

async function inspectModeMarker(app, inspectPaths) {
  const file = join(app, RUNTIME_MODE_FILE);
  await inspectAncestors(file, inspectPaths);
  const before = await lstat(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`Runtime mode marker is not a regular file: ${file}`);
  const handle = await open(file, "r");
  let bytes;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameSnapshot(opened, before)) throw new Error(`Runtime mode marker changed before read: ${file}`);
    if (opened.size > 4096n) throw new Error(`Runtime mode marker exceeds size limit: ${file}`);
    bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (offset !== bytes.length || !sameSnapshot(after, opened)) throw new Error(`Runtime mode marker changed during read: ${file}`);
  } finally { await handle.close(); }
  let marker;
  try { marker = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error(`Invalid runtime mode marker JSON: ${file}`); }
  if (marker?.format !== "quicker-agent-runtime-mode" || marker.version !== 1 || marker.mode !== "static")
    throw new Error(`Expected a version 1 static runtime mode marker: ${file}`);
  return { file: RUNTIME_MODE_FILE, format: marker.format, version: marker.version, mode: marker.mode,
    sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** Build once, physically relocate, then verify without starting product entrypoints. */
export async function checkStaticRuntimeClosure({ repositoryDirectory = repository, build = productionBuild, verify = productionVerify, inspectPaths = inspectWindowsMetadata } = {}) {
  const started = Date.now();
  const selected = resolve(repositoryDirectory);
  await inspectAncestors(selected, inspectPaths);
  const canonicalRepository = await realpath(selected);
  const temporary = await ownedDirectory(canonicalRepository, ".tmp", inspectPaths);
  const output = await ownedDirectory(temporary, "static-runtime-closure", inspectPaths);
  const run = await mkdtemp(join(output, "run-"));
  await checkDirectory(run, inspectPaths);
  const difference = relative(output, run);
  if (!difference.startsWith("run-") || isAbsolute(difference) || dirname(run) !== output) throw new Error("Invalid static closure run directory");
  const builtApp = join(run, "built-app"), relocatedApp = join(run, "relocated-app");
  const receipt = { format: "quicker-agent-static-runtime-closure", version: 1, ok: false, phase: "build",
    run, builtApp, relocatedApp, production: true, buildEntry: build === productionBuild ? productionEntry : "injected-build-port",
    nodeExecutable: process.execPath, nodeVersion: process.version,
    verificationMode: "dependency/native import only; no service, Electron, browser or PTY startup" };
  const save = async () => { receipt.elapsedMs = Date.now() - started; await checkDirectory(run, inspectPaths); await writeJson(join(run, "receipt.json"), receipt); };
  try {
    await save();
    receipt.build = await build({ development: false, outputDirectory: builtApp });
    if (typeof receipt.build?.appDirectory !== "string" || !samePath(resolve(receipt.build.appDirectory), builtApp)) {
      throw new Error("Production builder returned a different artifact directory");
    }
    await checkDirectory(builtApp, inspectPaths);
    receipt.runtimeMode = await inspectModeMarker(builtApp, inspectPaths);
    receipt.phase = "relocate";
    await inspectAncestors(relocatedApp, inspectPaths);
    await rename(builtApp, relocatedApp);
    await checkDirectory(relocatedApp, inspectPaths);
    receipt.phase = "verify";
    receipt.verification = await verify(relocatedApp, { nodeExecutable: process.execPath, desktop: false });
    if (receipt.verification?.ok !== true) throw new Error("Static runtime verifier did not approve the relocated artifact");
    const finalMode = await inspectModeMarker(relocatedApp, inspectPaths);
    if (finalMode.sha256 !== receipt.runtimeMode.sha256) throw new Error("Runtime mode marker changed after relocation or verification");
    receipt.runtimeMode = finalMode;
    receipt.runtimeModePreserved = true;
    receipt.ok = true;
    receipt.phase = "complete";
    await save();
    return receipt;
  } catch (error) {
    await checkDirectory(run, inspectPaths);
    await writeFile(join(run, "failure.log"), error.stack ?? String(error));
    await save();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkStaticRuntimeClosure().then((receipt) => console.log(`Production static runtime relocated and verified. Receipt: ${join(receipt.run, "receipt.json")}`))
    .catch((error) => { console.error(error); process.exit(1); });
}
