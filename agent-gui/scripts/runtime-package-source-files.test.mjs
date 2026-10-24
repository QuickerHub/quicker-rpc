import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPackageSourceInspector } from "./runtime-package-source-files.mjs";

const temporaryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../.tmp");
mkdirSync(temporaryRoot, { recursive: true });

function fixture(t, manifest = { name: "fixture", main: "index.js" }) {
  const root = mkdtempSync(join(temporaryRoot, "package-source-test-"));
  const source = join(root, "source");
  mkdirSync(source);
  writeFileSync(join(source, "package.json"), JSON.stringify(manifest));
  writeFileSync(join(source, "index.js"), "throw new Error('Package must never execute');");
  t.after(() => {
    const suffix = relative(temporaryRoot, root);
    assert.ok(suffix.startsWith("package-source-test-") && !isAbsolute(suffix) && !suffix.includes(".."));
    rmSync(root, { recursive: true, force: true });
  });
  return { root, source, target: join(root, "output") };
}

const inspector = () => createPackageSourceInspector({ inspectMetadata() {} });
function directoryLink(target, link, relativeTarget) {
  if (relativeTarget) {
    try { symlinkSync(relativeTarget, link, "dir"); return; }
    catch (error) { if (process.platform !== "win32" || error.code !== "EPERM") throw error; }
  }
  symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
}
function file(path, content) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }

test("internal links become regular copied entries and physical node_modules is excluded", (t) => {
  const f = fixture(t);
  mkdirSync(join(f.source, "payload"));
  writeFileSync(join(f.source, "payload/data.txt"), "internal bytes");
  directoryLink(join(f.source, "payload"), join(f.source, "alias"), "payload");
  mkdirSync(join(f.source, "node_modules/ignored/OneDrive-unread"), { recursive: true });
  writeFileSync(join(f.source, "node_modules/ignored/data.txt"), "not copied");
  const guard = inspector();
  guard.inspectPackage(f.source, "fixture");
  guard.copyPackage(f.source, f.target);
  assert.equal(readFileSync(join(f.target, "alias/data.txt"), "utf8"), "internal bytes");
  assert.equal(lstatSync(join(f.target, "alias")).isSymbolicLink(), false);
  assert.equal(existsSync(join(f.target, "node_modules")), false);
});

test("the physical node-gyp helper directory is omitted without resolving its generated links", (t) => {
  const f = fixture(t);
  const helper = join(f.source, "build/node_gyp_bins");
  mkdirSync(helper, { recursive: true });
  directoryLink(join(f.root, "missing-generated-python"), join(helper, "python3"));
  file(join(f.source, "build/Release/pty.node"), Buffer.from([0, 1, 2, 255]));
  file(join(f.source, "build/Release/spawn-helper"), "synthetic runtime helper");
  const guard = inspector();
  guard.inspectPackage(f.source, "fixture");
  guard.copyPackage(f.source, f.target);
  assert.equal(existsSync(join(f.target, "build/node_gyp_bins")), false);
  assert.deepEqual(readFileSync(join(f.target, "build/Release/pty.node")), Buffer.from([0, 1, 2, 255]));
  assert.equal(readFileSync(join(f.target, "build/Release/spawn-helper"), "utf8"), "synthetic runtime helper");
});

test("lookalike node-gyp helper paths retain ordinary payload bytes", (t) => {
  const f = fixture(t);
  const paths = ["node_gyp_bins/value.txt", "dist/build/node_gyp_bins/value.txt", "build/node_gyp_bins-extra/value.txt"];
  for (const path of paths) file(join(f.source, path), path);
  const guard = inspector();
  guard.inspectPackage(f.source, "fixture");
  guard.copyPackage(f.source, f.target);
  for (const path of paths) assert.equal(readFileSync(join(f.target, path), "utf8"), path);
});

for (const path of ["node_gyp_bins", "dist/build/node_gyp_bins", "build/node_gyp_bins-extra", "build/Release"])
  test(`an external fixture link in ${path} remains rejected`, (t) => {
    const f = fixture(t);
    const target = join(f.root, "generated-target");
    mkdirSync(target);
    file(join(target, "value.txt"), "fixture bytes outside the package");
    mkdirSync(join(f.source, path), { recursive: true });
    directoryLink(target, join(f.source, path, "linked-payload"));
    assert.throws(() => inspector().inspectPackage(f.source, "fixture"), /escapes its root/);
    assert.equal(existsSync(f.target), false);
  });

for (const type of ["file", "link"])
  test(`an ordinary build ${type} without node-gyp scaffolding remains valid`, (t) => {
    const f = fixture(t);
    if (type === "file") file(join(f.source, "build"), "ordinary build-named payload");
    else {
      file(join(f.source, "payload/value.txt"), "ordinary internal payload");
      directoryLink(join(f.source, "payload"), join(f.source, "build"));
    }
    const guard = inspector();
    guard.inspectPackage(f.source, "fixture");
    guard.copyPackage(f.source, f.target);
    assert.equal(readFileSync(join(f.target, type === "file" ? "build" : "build/value.txt"), "utf8"),
      type === "file" ? "ordinary build-named payload" : "ordinary internal payload");
  });

for (const [path, type] of [["build", "link"], ["build/node_gyp_bins", "file"], ["build/node_gyp_bins", "link"]])
  test(`${path} must be a physical directory rather than a ${type}`, (t) => {
    const f = fixture(t);
    const entry = join(f.source, path);
    mkdirSync(dirname(entry), { recursive: true });
    if (type === "file") writeFileSync(entry, "synthetic scaffold name used as a file");
    else {
      const target = join(f.source, "payload");
      mkdirSync(target);
      if (path === "build") file(join(target, "node_gyp_bins/generated.txt"), "synthetic build helper bytes");
      directoryLink(target, entry);
    }
    assert.throws(() => inspector().inspectPackage(f.source, "fixture"), /physical directory|node_gyp_bins|build helper|redirect/i);
    assert.equal(existsSync(f.target), false);
  });

for (const suffix of ["", "/nested"])
  test(`a retained alias cannot enter node-gyp helper${suffix || " root"}`, (t) => {
    const f = fixture(t);
    const target = join(f.source, `build/node_gyp_bins${suffix}`);
    mkdirSync(target, { recursive: true });
    file(join(target, "entry.js"), "throw new Error('Build helper must never execute');");
    directoryLink(target, join(f.source, "alias"));
    assert.throws(() => inspector().inspectPackage(f.source, "fixture"), /excluded|node_gyp_bins|build helper/i);
  });

for (const [name, fields] of [
  ["main", { main: "build/node_gyp_bins/entry.js" }],
  ["percent-encoded main", { main: "build/%6eode_gyp_bins/entry.js" }],
  ["exports:null legacy main", { exports: null, main: "build/node_gyp_bins/entry.js" }],
  ["exports:null percent-encoded legacy main", { exports: null, main: "build/%6eode_gyp_bins/entry.js" }],
  ["exports", { exports: "./build/node_gyp_bins/entry.js" }],
  ["percent-encoded exports", { exports: { ".": { require: "./build/%6Eode_gyp_bins/entry.js", default: "./index.js" } } }],
  ["backslash exports", { exports: "./build\\node_gyp_bins/python3/entry.js" }],
  ["imports", { imports: { "#helper": "./build/node_gyp_bins/entry.js" } }],
  ["percent-encoded imports", { imports: { "#helper/*": ["./index.js", "./build/%6eode_gyp_bins/*.js"] } }],
  ["backslash imports", { imports: { "#helper": "./build\\node_gyp_bins/python3/entry.js" } }],
]) test(`${name} cannot declare a runtime target inside node-gyp helpers`, (t) => {
  const f = fixture(t, { name: "fixture", main: "index.js", ...fields });
  file(join(f.source, "build/node_gyp_bins/entry.js"), "throw new Error('Build helper must never execute');");
  file(join(f.source, "build/node_gyp_bins/python3/entry.js"), "throw new Error('Build helper must never execute');");
  const guard = inspector();
  assert.throws(() => guard.inspectPackage(f.source, "fixture"), /excluded|node_gyp_bins|build helper/i);
  assert.throws(() => guard.copyPackage(f.source, f.target), /not inspected/);
  assert.equal(existsSync(f.target), false);
});

for (const path of ["build", "build/node_gyp_bins"]) for (const type of ["file", "link"])
  test(`copying refuses ${path} changed into a ${type} after inspection`, (t) => {
    const f = fixture(t);
    file(join(f.source, "build/node_gyp_bins/generated.txt"), "ignored build bytes");
    file(join(f.source, "payload/value.txt"), "retained local bytes");
    const guard = inspector();
    guard.inspectPackage(f.source, "fixture");
    const entry = join(f.source, path);
    renameSync(entry, join(f.root, "saved-scaffold"));
    if (type === "file") writeFileSync(entry, "replacement file");
    else directoryLink(join(f.source, "payload"), entry);
    assert.throws(() => guard.copyPackage(f.source, f.target), /changed after inspection|physical directory|node_gyp_bins|build helper|redirect/i);
    assert.equal(existsSync(join(f.target, "build/node_gyp_bins")), false);
  });

test("an external junction is rejected before package contents can be copied", (t) => {
  const f = fixture(t);
  const external = join(f.root, "external");
  mkdirSync(external);
  writeFileSync(join(external, "synthetic-outside.txt"), "external bytes");
  directoryLink(external, join(f.source, "escape"));
  const guard = inspector();
  assert.throws(() => guard.inspectPackage(f.source, "fixture"), /escapes its root/);
  assert.throws(() => guard.copyPackage(f.source, f.target), /not inspected/);
  assert.equal(existsSync(f.target), false);
});

test("a node_modules alias cannot bypass the excluded dependency directory", (t) => {
  const f = fixture(t);
  mkdirSync(join(f.source, "node_modules/undeclared"), { recursive: true });
  directoryLink(join(f.source, "node_modules"), join(f.source, "alias"), "node_modules");
  assert.throws(() => inspector().inspectPackage(f.source, "fixture"), /excluded node_modules/);
});

test("node_modules exclusion follows filesystem case rules for directories and aliases", (t) => {
  const f = fixture(t);
  mkdirSync(join(f.source, "NODE_MODULES"));
  writeFileSync(join(f.source, "NODE_MODULES/data.txt"), "case-sensitive dependency bytes");
  const guard = inspector();
  guard.inspectPackage(f.source, "fixture");
  guard.copyPackage(f.source, f.target);
  assert.equal(existsSync(join(f.target, "NODE_MODULES/data.txt")), process.platform !== "win32");
  const linked = fixture(t);
  mkdirSync(join(linked.source, "NODE_MODULES"));
  writeFileSync(join(linked.source, "NODE_MODULES/data.txt"), "case-sensitive dependency bytes");
  directoryLink(join(linked.source, "NODE_MODULES"), join(linked.source, "alias"), "NODE_MODULES");
  const second = inspector();
  if (process.platform === "win32") {
    assert.throws(() => second.inspectPackage(linked.source, "fixture"), /excluded node_modules/);
  } else {
    second.inspectPackage(linked.source, "fixture");
    second.copyPackage(linked.source, linked.target);
    assert.equal(readFileSync(join(linked.target, "alias/data.txt"), "utf8"), "case-sensitive dependency bytes");
  }
});

test("broken links and active real-directory cycles fail closed", (t) => {
  const broken = fixture(t);
  directoryLink(join(broken.source, "missing"), join(broken.source, "dangling"));
  assert.throws(() => inspector().inspectPackage(broken.source, "fixture"), { code: "ENOENT" });
  const cycle = fixture(t);
  directoryLink(cycle.source, join(cycle.source, "loop"), ".");
  assert.throws(() => inspector().inspectPackage(cycle.source, "fixture"), /directory cycle/);
});

test("a PNPM-style root link is accepted after inspecting candidate and target metadata", (t) => {
  const f = fixture(t);
  const link = join(f.root, "package-link");
  directoryLink(f.source, link);
  const calls = [];
  const guard = createPackageSourceInspector({ inspectMetadata(paths, options) { calls.push({ paths, options }); } });
  assert.equal(guard.inspectCandidate(link), realpathSync(f.source));
  assert.ok(calls.some(({ paths }) => paths.includes(link)));
  assert.ok(calls.some(({ paths }) => paths.includes(f.source)));
  guard.inspectPackage(f.source, "fixture");
  guard.inspectPackage(f.source, "fixture");
  guard.inspectCandidate(link);
  assert.equal(calls.filter(({ options }) => options?.treeRoot === f.source).length, 1);
});

test("a candidate ancestor link target is inspected before its remaining descendant path", (t) => {
  const f = fixture(t);
  const link = join(f.root, "parent-link");
  directoryLink(f.root, link);
  const raw = join(link, "source");
  const calls = [];
  const guard = createPackageSourceInspector({ inspectMetadata(paths) { calls.push(...paths); } });
  assert.equal(guard.inspectCandidate(raw), realpathSync(f.source));
  assert.equal(calls[0], raw);
  assert.ok(calls.indexOf(f.root) > 0);
  assert.ok(calls.indexOf(f.source) > calls.indexOf(f.root));
});

test("successful candidate caches recheck parent and link proofs before following a changed target", (t) => {
  for (const ancestor of [false, true]) {
    const f = fixture(t);
    const parent = join(f.root, "lookup-link");
    directoryLink(ancestor ? f.root : f.source, parent);
    const candidate = ancestor ? join(parent, "source") : parent;
    const calls = [];
    const guard = createPackageSourceInspector({ inspectMetadata(paths) { calls.push(...paths); } });
    assert.equal(guard.inspectCandidate(candidate), realpathSync(f.source));
    assert.equal(guard.inspectCandidate(candidate), realpathSync(f.source));
    // Other test files can change a shared ancestor (for example .tmp).
    // Rechecking its metadata is safe; an exact cache-hit count is not stable.
    const beforeRetarget = calls.length;
    const cloud = join(f.root, "OneDrive-synthetic");
    mkdirSync(cloud);
    // Remove only this test-owned link; never recursively visit its target.
    rmSync(parent);
    directoryLink(cloud, parent);
    assert.throws(() => guard.inspectCandidate(candidate), /Unsafe package source path/);
    assert.ok(calls.length > beforeRetarget, "A changed ancestor must invalidate the metadata cache");
  }
});

test("an unrelated ancestor directory change safely rechecks an otherwise unchanged candidate", (t) => {
  const f = fixture(t), calls = [];
  const guard = createPackageSourceInspector({ inspectMetadata(paths) { calls.push(...paths); } });
  assert.equal(guard.inspectCandidate(f.source), realpathSync(f.source));
  const beforeChange = calls.length;
  const ancestorBefore = lstatSync(f.root, { bigint: true });
  mkdirSync(join(f.root, "parallel-fixture"));
  // Creating a sibling does not reliably change the directory snapshot on NTFS.
  // Make this metadata change explicit instead of waiting for clock progress.
  utimesSync(f.root, ancestorBefore.atime, new Date(Number(ancestorBefore.mtimeMs) + 2000));
  assert.notEqual(lstatSync(f.root, { bigint: true }).mtimeNs, ancestorBefore.mtimeNs);
  assert.equal(guard.inspectCandidate(f.source), realpathSync(f.source));
  assert.ok(calls.length > beforeChange, "Ancestor metadata changes require a fresh check even when the package itself is unchanged");
});

test("genuinely missing candidate suffixes are not cached and may appear later", (t) => {
  const f = fixture(t);
  const candidate = join(f.root, "lookups/missing-package");
  const calls = [];
  const guard = createPackageSourceInspector({ inspectMetadata(paths) { calls.push(...paths); } });
  assert.equal(guard.inspectCandidate(candidate), undefined);
  assert.equal(guard.inspectCandidate(candidate), undefined);
  assert.equal(calls.filter((path) => path === candidate).length, 2);
  mkdirSync(candidate, { recursive: true });
  assert.equal(guard.inspectCandidate(candidate), realpathSync(candidate));
  assert.equal(calls.filter((path) => path === candidate).length, 3);
  const file = join(f.root, "ordinary-file");
  writeFileSync(file, "not a directory");
  assert.equal(guard.inspectCandidate(join(file, "missing-package")), undefined);
});

test("missing suffixes below a root link still inspect the target on every unsuccessful lookup", (t) => {
  const f = fixture(t);
  const link = join(f.root, "parent-link");
  directoryLink(f.source, link);
  const candidate = join(link, "missing-package");
  let unsafe = false;
  const calls = [];
  const failure = new Error("synthetic cloud placeholder target");
  const guard = createPackageSourceInspector({ inspectMetadata(paths) {
    calls.push(...paths);
    if (unsafe && paths.includes(f.source)) throw failure;
  } });
  assert.equal(guard.inspectCandidate(candidate), undefined);
  assert.ok(calls.indexOf(f.source) > calls.indexOf(candidate));
  unsafe = true;
  assert.throws(() => guard.inspectCandidate(candidate), (error) => error === failure);
  assert.equal(calls.filter((path) => path === f.source).length, 2);
});

test("an existing broken root link is not disguised as an absent package suffix", (t) => {
  const f = fixture(t);
  const link = join(f.root, "broken-link");
  directoryLink(join(f.root, "missing-target"), link);
  const guard = inspector();
  assert.throws(() => guard.inspectCandidate(link), { code: "ENOENT" });
  assert.throws(() => guard.inspectCandidate(join(link, "missing-package")), { code: "ENOENT" });
});

test("a missing suffix cannot hide a cloud-named link target or a metadata error", (t) => {
  const f = fixture(t);
  const target = join(f.root, "OneDrive-synthetic");
  mkdirSync(target);
  const link = join(f.root, "cloud-link");
  directoryLink(target, link);
  assert.throws(() => inspector().inspectCandidate(join(link, "missing-package")), /Unsafe package source path/);
  const failure = Object.assign(new Error("synthetic metadata access denied"), { code: "EACCES" });
  const guard = createPackageSourceInspector({ inspectMetadata() { throw failure; } });
  assert.throws(() => guard.inspectCandidate(join(f.root, "missing-package")), (error) => error === failure);
});

test("package metadata must pass before any JSON is parsed", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.source, "package.json"), "invalid JSON must not be parsed");
  const guard = createPackageSourceInspector({ inspectMetadata() { throw new Error("synthetic placeholder metadata"); } });
  assert.throws(() => guard.inspectPackage(f.source, "fixture"), /synthetic placeholder metadata/);
  assert.throws(() => guard.readManifest(f.source), /not inspected/);
});

test("external manifests are rejected before their JSON is read", (t) => {
  const f = fixture(t);
  const external = join(f.root, "external");
  mkdirSync(external);
  writeFileSync(join(external, "invalid.json"), "invalid JSON must not be parsed");
  // A directory link with package.json below it exercises both manifest and ancestor guards.
  directoryLink(external, join(f.source, "external"));
  assert.throws(() => inspector().inspectPackage(f.source, "fixture"), /escapes its root/);
});

test("legacy main cannot escape lexically, while exports can make a decoy main irrelevant", (t) => {
  const legacy = fixture(t, { name: "fixture", main: "../missing-external.js" });
  assert.throws(() => inspector().inspectPackage(legacy.source, "fixture"), /escapes its root/);
  const exported = fixture(t, { name: "fixture", main: "../missing-external.js", exports: "./index.js" });
  assert.equal(inspector().inspectPackage(exported.source, "fixture").exports, "./index.js");
  assert.throws(() => inspector().inspectPackage(exported.source, "buffer"), /escapes its root/);
});

test("failed manifest validation cannot leave a copyable package preparation", (t) => {
  const f = fixture(t, { name: "fixture", main: "../external.js" });
  const guard = inspector();
  assert.throws(() => guard.inspectPackage(f.source, "fixture"), /escapes its root/);
  assert.throws(() => guard.copyPackage(f.source, f.target), /not inspected/);
  assert.equal(existsSync(f.target), false);
});

test("changed source files are refused by the copy filter before new bytes are copied", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.source, "data.txt"), "old bytes");
  const guard = inspector();
  guard.inspectPackage(f.source, "fixture");
  writeFileSync(join(f.source, "data.txt"), "new changed bytes");
  assert.throws(() => guard.copyPackage(f.source, f.target), /changed after inspection/);
  assert.equal(existsSync(join(f.target, "data.txt")), false);
});

test("changed manifests and retargeted links invalidate the source proof", (t) => {
  const f = fixture(t);
  const guard = inspector();
  guard.inspectPackage(f.source, "fixture");
  writeFileSync(join(f.source, "package.json"), "invalid JSON after preparation");
  assert.throws(() => guard.readManifest(f.source), /changed after inspection/);
  const linked = fixture(t);
  mkdirSync(join(linked.source, "payload"));
  writeFileSync(join(linked.source, "payload/data.txt"), "internal bytes");
  directoryLink(join(linked.source, "payload"), join(linked.source, "alias"));
  const second = inspector();
  second.inspectPackage(linked.source, "fixture");
  renameSync(join(linked.source, "payload"), join(linked.root, "moved"));
  directoryLink(join(linked.root, "moved"), join(linked.source, "payload"));
  assert.throws(() => second.copyPackage(linked.source, linked.target), /changed after inspection/);
  assert.equal(existsSync(join(linked.target, "alias/data.txt")), false);
});

test("unprepared reads, unprepared copies and asynchronous metadata ports are rejected", (t) => {
  const f = fixture(t);
  const guard = inspector();
  assert.throws(() => guard.readManifest(f.source), /not inspected/);
  assert.throws(() => guard.copyPackage(f.source, f.target), /not inspected/);
  assert.throws(() => createPackageSourceInspector({ inspectMetadata() { return Promise.resolve(); } }).inspectPackage(f.source, "fixture"), /must be synchronous/);
});

test("the actual Windows metadata tool allows safe links without traversing reparse entries", { skip: process.platform !== "win32" }, (t) => {
  const f = fixture(t);
  mkdirSync(join(f.source, "payload"));
  writeFileSync(join(f.source, "payload/data.txt"), "internal bytes");
  directoryLink(join(f.source, "payload"), join(f.source, "alias"));
  mkdirSync(join(f.source, "NODE_MODULES/OneDrive-unread"), { recursive: true });
  const guard = createPackageSourceInspector();
  assert.equal(guard.inspectCandidate(f.source), realpathSync(f.source));
  guard.inspectPackage(f.source, "fixture");
  guard.copyPackage(f.source, f.target);
  assert.equal(readFileSync(join(f.target, "alias/data.txt"), "utf8"), "internal bytes");
  assert.equal(existsSync(join(f.target, "NODE_MODULES")), false);
  const external = fixture(t);
  const outside = join(external.root, "outside");
  mkdirSync(join(outside, "OneDrive-unread"), { recursive: true });
  directoryLink(outside, join(external.source, "escape"));
  assert.throws(() => createPackageSourceInspector().inspectPackage(external.source, "fixture"), /escapes its root/);
});

test("the actual metadata tool rejects a synthetic Offline attribute before content copying", { skip: process.platform !== "win32" }, (t) => {
  const f = fixture(t);
  const file = join(f.source, "offline.txt");
  writeFileSync(file, "synthetic local bytes; never read while marked offline");
  const script = join(f.root, "attributes.ps1");
  writeFileSync(script, "param([string]$Path, [int]$Value)\n[IO.File]::SetAttributes($Path, [IO.FileAttributes]$Value)\n");
  const attributes = (value) => {
    const result = spawnSync("pwsh", ["-NoProfile", "-File", script, file, String(value)], { encoding: "utf8", windowsHide: true, timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
  };
  const prepared = createPackageSourceInspector();
  prepared.inspectPackage(f.source, "fixture");
  attributes(0x1000);
  try {
    const link = join(f.root, "parent-link");
    directoryLink(f.source, link);
    const raw = join(link, "offline.txt");
    const metadataScript = fileURLToPath(new URL("./Inspect-RuntimePackageSource.ps1", import.meta.url));
    const exact = spawnSync("pwsh", ["-NoProfile", "-File", metadataScript, "-PathsJson", JSON.stringify([raw])], { encoding: "utf8", windowsHide: true, timeout: 10000 });
    assert.equal(exact.status, 0, "Exact metadata must stop at the parent junction before inspecting the Offline descendant");
    const redirectedTree = spawnSync("pwsh", ["-NoProfile", "-File", metadataScript, "-PathsJson", JSON.stringify([link]), "-TreeRoot", link], { encoding: "utf8", windowsHide: true, timeout: 10000 });
    assert.notEqual(redirectedTree.status, 0);
    assert.match(redirectedTree.stderr, /redirected ancestor/);
    assert.throws(() => createPackageSourceInspector().inspectCandidate(raw), /cloud placeholder/);
    assert.throws(() => createPackageSourceInspector().inspectCandidate(join(raw, "missing-package")), /cloud placeholder/);
    assert.throws(() => createPackageSourceInspector().inspectPackage(f.source, "fixture"), /cloud placeholder/);
    assert.equal(existsSync(f.target), false);
    const afterProofTarget = join(f.root, "after-proof-output");
    assert.throws(() => prepared.copyPackage(f.source, afterProofTarget), /changed after inspection/);
    assert.equal(existsSync(join(afterProofTarget, "offline.txt")), false);
  } finally {
    attributes(0x80);
  }
});
