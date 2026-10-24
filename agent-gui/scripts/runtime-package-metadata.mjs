import { spawn, spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const repository = resolve(scripts, "../.."), temporary = join(repository, ".tmp");
const pause = new Int32Array(new SharedArrayBuffer(4));
const sleep = () => Atomics.wait(pause, 0, 0, 10);
const local = (path) => {
  if (/^(?:\\\\|\/\/)/.test(path) || /(?:^|[/\\])(?:OneDrive[^/\\]*|Dropbox|iCloud[^/\\]*)(?:[/\\]|$)/i.test(path))
    throw new Error(`Unsafe package metadata session path: ${path}`);
};
function ancestors(path) {
  local(path);
  const pending = [];
  for (let current = resolve(path); ; current = dirname(current)) {
    pending.push(current);
    if (dirname(current) === current) break;
  }
  for (const current of pending.reverse()) {
    try {
      const info = lstatSync(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Redirected package metadata session path: ${current}`);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

/** One owned PowerShell process; each call retains the original metadata checks. */
export function createWindowsPackageMetadataInspector({ timeoutMs = 30_000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error("Metadata timeout must be between 1 and 30000 milliseconds");
  if (process.platform !== "win32") return Object.assign(() => {}, { dispose() {} });
  let child, session, identity, disposed = false, sequence = 0;
  function assertSession() {
    if (!session || dirname(session) !== temporary || !basename(session).startsWith("runtime-package-metadata-")) throw new Error("Invalid metadata session ownership");
    ancestors(session);
    const info = lstatSync(session);
    if (realpathSync(session) !== session || info.dev !== identity.dev || info.ino !== identity.ino) throw new Error("Metadata session identity changed");
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    process.removeListener("exit", dispose);
    // ChildProcess.kill uses the retained child handle, never a PID/name scan.
    try { child?.kill(); } catch {}
    if (!session) return;
    const until = Date.now() + 1000;
    let last;
    do {
      try { assertSession(); rmSync(session, { recursive: true, force: true }); return; }
      catch (error) {
        if (error.code === "ENOENT") return;
        last = error;
        if (!["EBUSY", "EPERM", "EACCES", "ENOTEMPTY"].includes(error.code)) break;
        sleep();
      }
    } while (Date.now() < until);
    // Retain an unsafe/busy directory; never broaden cleanup to its parent.
    try { assertSession(); writeFileSync(join(session, "cleanup-error.json"), JSON.stringify({ session, error: last?.message })); } catch {}
    return { retainedSession: session, error: last?.message };
  }
  function fail(message) { dispose(); throw new Error(message); }
  function readPacket(path) {
    assertSession();
    try {
      const info = lstatSync(path);
      if (info.isSymbolicLink() || !info.isFile() || info.size > 1024 * 1024) throw new Error("Invalid metadata response file");
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) { if (error.code === "ENOENT") return; throw error; }
  }
  function waitFor(path, description, validate, until = Date.now() + timeoutMs) {
    while (true) {
      let packet;
      try { packet = readPacket(path); } catch (error) { fail(`Package metadata protocol failed: ${error.message}`); }
      if (packet) {
        if (!validate(packet)) fail(`Invalid package metadata ${description} response`);
        return packet;
      }
      if (Date.now() >= until) fail(`Package metadata ${description} timed out after ${timeoutMs}ms`);
      sleep();
    }
  }
  function start() {
    const until = Date.now() + timeoutMs;
    const guard = spawnSync("pwsh", ["-NoProfile", "-File", join(scripts, "Assert-NsisFixturePaths.ps1"), "-PathsJson", JSON.stringify([temporary])], { encoding: "utf8", windowsHide: true, timeout: timeoutMs });
    if (guard.error || guard.status !== 0 || !/^fixture-metadata-ok:\d+\s*$/.test(guard.stdout))
      fail(`Unsafe package metadata temporary directory: ${guard.error?.message || guard.stderr || guard.stdout}`);
    ancestors(temporary);
    mkdirSync(temporary, { recursive: true });
    ancestors(temporary);
    if (realpathSync(temporary) !== temporary) fail("Redirected package metadata temporary directory");
    session = mkdtempSync(join(temporary, "runtime-package-metadata-"));
    identity = lstatSync(session);
    assertSession();
    process.once("exit", dispose);
    child = spawn("pwsh", ["-NoProfile", "-File", join(scripts, "Inspect-RuntimePackageSource.ps1"), "-SessionDirectory", session, "-ParentProcessId", String(process.pid)], { windowsHide: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
    if (!child.pid) fail("Package metadata worker failed to start");
    waitFor(join(session, "ready.json"), "startup", (packet) => packet.ok === true && packet.workerPid === child.pid && packet.parentPid === process.pid, until);
  }
  const inspect = (paths, { treeRoot } = {}) => {
    if (disposed) throw new Error("Package metadata inspector is disposed");
    if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string") || treeRoot != null && typeof treeRoot !== "string") throw new Error("Invalid package metadata request paths");
    try {
      if (!session) start();
      assertSession();
      const id = ++sequence, request = join(session, `request-${id}.json`), pending = join(session, `.request-${id}.tmp`), response = join(session, `response-${id}.json`);
      const serialized = JSON.stringify({ id, pathsJson: JSON.stringify(paths), treeRoot: treeRoot ?? null });
      if (Buffer.byteLength(serialized) > 1024 * 1024) throw new Error("Package metadata request is too large");
      writeFileSync(pending, serialized, { flag: "wx" });
      renameSync(pending, request);
      const packet = waitFor(response, `request ${id}`, (value) => value.id === id && value.workerPid === child.pid && typeof value.ok === "boolean");
      rmSync(request); rmSync(response);
      if (!packet.ok) throw Object.assign(new Error(`Package source metadata rejected: ${packet.error}`), { code: "ERR_PACKAGE_METADATA_REJECTED" });
      if (typeof packet.output !== "string" || !/^runtime-package-source-metadata-ok:\d+\s*$/.test(packet.output)) fail("Invalid package source metadata result");
      return packet;
    } catch (error) {
      if (error.code !== "ERR_PACKAGE_METADATA_REJECTED") dispose();
      throw error;
    }
  };
  inspect.dispose = dispose;
  return inspect;
}
