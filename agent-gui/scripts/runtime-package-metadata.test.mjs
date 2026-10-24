import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createWindowsPackageMetadataInspector } from "./runtime-package-metadata.mjs";

const scripts = dirname(fileURLToPath(import.meta.url)), temporary = resolve(scripts, "../../.tmp");
const windows = { skip: process.platform !== "win32" };
function fixture(t) {
  mkdirSync(temporary, { recursive: true });
  const root = mkdtempSync(join(temporary, "metadata-test-"));
  t.after(() => {
    const suffix = relative(temporary, root);
    assert.ok(suffix && !suffix.startsWith("..") && !suffix.includes(sep));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function captureSpawn(t, replacement) {
  const actual = childProcess.spawn, calls = [];
  const mock = t.mock.method(childProcess, "spawn", (command, args, options) => {
    const child = replacement ? replacement(actual, command, args, options) : actual(command, args, options);
    calls.push({ child, args, session: args[args.indexOf("-SessionDirectory") + 1], options });
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => { mock.mock.restore(); syncBuiltinESMExports(); });
  return calls;
}
async function exited(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error("Owned metadata child did not exit")), 5000);
    child.once("exit", () => { clearTimeout(timer); done(); });
  });
}

test("metadata factory is lazy and validates bounded timeout options", () => {
  const inspect = createWindowsPackageMetadataInspector();
  inspect.dispose();
  assert.throws(() => createWindowsPackageMetadataInspector({ timeoutMs: 0 }), /timeout/);
  assert.throws(() => createWindowsPackageMetadataInspector({ timeoutMs: 30001 }), /timeout/);
});

test("two real requests reuse one owned worker and disposal removes its session", windows, async (t) => {
  const root = fixture(t); writeFileSync(join(root, "payload.txt"), "metadata only");
  const calls = captureSpawn(t), inspect = createWindowsPackageMetadataInspector();
  t.after(() => inspect.dispose());
  assert.equal(calls.length, 0);
  const first = inspect([root]), second = inspect([root], { treeRoot: root });
  assert.equal(calls.length, 1);
  assert.equal(first.workerPid, second.workerPid);
  assert.equal(first.id, 1); assert.equal(second.id, 2);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.stdio, "ignore");
  assert.ok(existsSync(calls[0].session));
  inspect.dispose();
  await exited(calls[0].child);
  assert.equal(calls[0].child.killed, true);
  assert.equal(existsSync(calls[0].session), false);
  assert.throws(() => inspect([root]), /disposed/);
});

test("a real metadata rejection does not kill the reusable worker", windows, (t) => {
  const root = fixture(t), cloud = join(root, "OneDrive-synthetic");
  const calls = captureSpawn(t), inspect = createWindowsPackageMetadataInspector();
  t.after(() => inspect.dispose());
  const first = inspect([root]);
  mkdirSync(join(cloud, "must-not-descend"), { recursive: true });
  assert.throws(() => inspect([root], { treeRoot: root }), /Unsafe package source path/);
  rmSync(cloud, { recursive: true });
  const third = inspect([root], { treeRoot: root });
  assert.equal(third.workerPid, first.workerPid);
  assert.equal(third.id, 3);
  assert.equal(calls.length, 1);
});

test("the unchanged single-request CLI rejects Windows cloud directory names", windows, (t) => {
  const root = fixture(t); mkdirSync(join(root, "OneDrive-synthetic/descendant"), { recursive: true });
  const result = childProcess.spawnSync("pwsh", ["-NoProfile", "-File", join(scripts, "Inspect-RuntimePackageSource.ps1"), "-PathsJson", JSON.stringify([root]), "-TreeRoot", root], { encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsafe package source path/);
});

for (const startup of [false, true]) test(`${startup ? "startup" : "request"} timeout kills only the owned worker and cleans its session`, windows, async (t) => {
  const root = fixture(t), fake = join(root, "unresponsive-worker.ps1");
  writeFileSync(fake, `param([string]$SessionDirectory,[int]$ParentProcessId)\n${startup ? "" : "[IO.File]::WriteAllText((Join-Path $SessionDirectory 'ready.json'), (@{ok=$true;workerPid=$PID;parentPid=$ParentProcessId}|ConvertTo-Json -Compress))"}\nStart-Sleep -Seconds 30\n`);
  const calls = captureSpawn(t, (actual, command, args, options) => {
    const selected = [...args]; selected[selected.indexOf("-File") + 1] = fake;
    return actual(command, selected, options);
  });
  const inspect = createWindowsPackageMetadataInspector({ timeoutMs: 5000 });
  t.after(() => inspect.dispose());
  assert.throws(() => inspect([root]), new RegExp(`${startup ? "startup" : "request 1"} timed out`));
  assert.equal(calls.length, 1);
  await exited(calls[0].child);
  assert.equal(calls[0].child.killed, true);
  assert.equal(existsSync(calls[0].session), false);
});

test("worker mode rejects a session outside its exact owned .tmp parent", windows, (t) => {
  const root = fixture(t);
  const result = childProcess.spawnSync("pwsh", ["-NoProfile", "-File", join(scripts, "Inspect-RuntimePackageSource.ps1"), "-SessionDirectory", root, "-ParentProcessId", String(process.pid)], { encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid metadata worker session/);
});
