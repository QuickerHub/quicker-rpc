import assert from "node:assert/strict";
import fs, { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findRuntimePackage, isRuntimePackageMissing, runtimeDependencyEntries, verifyRuntimeDependencyGraph } from "./static-runtime-dependency-graph.mjs";

const temporary = resolve(dirname(fileURLToPath(import.meta.url)), "../../.tmp");
function fixture(t) {
  mkdirSync(temporary, { recursive: true });
  const root = mkdtempSync(join(temporary, "runtime-graph-"));
  t.after(() => {
    const suffix = relative(temporary, root);
    assert.ok(suffix && !suffix.startsWith("..") && !suffix.includes(sep));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function file(path, content) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
function pkg(parent, name, options = {}) {
  const path = join(parent, "node_modules", name);
  file(join(path, "package.json"), JSON.stringify({ name, version: "1.0.0", main: "index.js", ...options }));
  file(join(path, "index.js"), "throw new Error('Provider code must never execute during metadata checks');\n");
  return path;
}

test("shared runtime edges preserve optional overrides, peers and deterministic kinds", () => {
  assert.deepEqual(runtimeDependencyEntries({
    dependencies: { z: "1", overlap: "1", a: "1" },
    optionalDependencies: { overlap: "2", optional: "1" },
    peerDependencies: { z: "2", overlap: "3", optional: "2", peer: "1", absentPeer: "1" },
    peerDependenciesMeta: { absentPeer: { optional: true } },
  }), [
    { name: "a", kind: "dependency", optional: false },
    { name: "z", kind: "dependency", optional: false },
    { name: "optional", kind: "optional", optional: true },
    { name: "overlap", kind: "optional", optional: true },
    { name: "absentPeer", kind: "optionalPeer", optional: true },
    { name: "peer", kind: "peer", optional: false },
  ]);
  assert.deepEqual(runtimeDependencyEntries({}), []);
  assert.throws(() => runtimeDependencyEntries({ dependencies: { invalid: 7 } }), /Invalid runtime dependencies/);
  assert.throws(() => runtimeDependencyEntries({ optionalDependencies: [] }), /Invalid runtime optionalDependencies/);
  assert.throws(() => runtimeDependencyEntries({ peerDependencies: { "../invalid": "1" } }), /Invalid runtime package name/);
});

test("package inspection hooks run before canonical candidate checks and manifest reads", (t) => {
  const root = fixture(t), source = pkg(root, "source");
  const candidate = join(root, "node_modules/alias"), events = [];
  symlinkSync(source, candidate, process.platform === "win32" ? "junction" : "dir");
  const canonicalSource = realpathSync(source), canonicalManifest = join(canonicalSource, "package.json");
  const resolved = findRuntimePackage("alias", root, (path) => events.push(["assertPath", path]), {
    inspectCandidate: (path) => events.push(["candidate", path]),
    inspectPackage: (path, name) => events.push(["package", path, name]),
  });
  assert.equal(resolved, canonicalSource);
  const candidateIndex = events.findIndex(([kind]) => kind === "candidate");
  const directoryIndex = events.findIndex(([kind, path]) => kind === "assertPath" && path === canonicalSource);
  const packageIndex = events.findIndex(([kind]) => kind === "package");
  const manifestIndex = events.findIndex(([kind, path]) => kind === "assertPath" && path === canonicalManifest);
  assert.deepEqual(events[candidateIndex], ["candidate", candidate]);
  assert.deepEqual(events[packageIndex], ["package", canonicalSource, "alias"]);
  assert.ok(candidateIndex < directoryIndex && directoryIndex < packageIndex && packageIndex < manifestIndex);
});

for (const exists of [true, false]) test(`candidate metadata rejection precedes lstat through an unchecked ancestor link: ${exists ? "existing" : "missing"}`, (t) => {
  const root = fixture(t), caller = join(root, "caller"), outside = join(root, "outside");
  mkdirSync(caller); mkdirSync(outside);
  const name = "fixture-candidate-order-7d701ef1";
  if (exists) mkdirSync(join(outside, name));
  symlinkSync(outside, join(caller, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const candidate = join(caller, "node_modules", name), events = [];
  const originalLstat = fs.lstatSync;
  const mock = t.mock.method(fs, "lstatSync", (path, ...args) => {
    if (path === candidate) events.push("lstat");
    return originalLstat(path, ...args);
  });
  const rejection = new Error("fixture candidate metadata rejected");
  syncBuiltinESMExports();
  try {
    assert.throws(() => findRuntimePackage(name, caller, () => {}, {
      inspectCandidate(path) {
        assert.equal(path, candidate, "even a missing descendant must be inspected before lookup continues");
        events.push("metadata");
        throw rejection;
      },
    }), (error) => error === rejection && !isRuntimePackageMissing(error));
    assert.deepEqual(events, ["metadata"]);
  } finally { mock.mock.restore(); syncBuiltinESMExports(); }
});

test("inspection rejections precede broken JSON and broken entry resolution and are never missing", (t) => {
  const root = fixture(t), broken = pkg(root, "broken", { main: "missing-entry.js" });
  file(join(broken, "package.json"), "not JSON; inspection must reject first");
  const rejection = new Error("fixture package tree rejected");
  let packageInspected = false;
  assert.throws(() => findRuntimePackage("broken", root, () => {}, {
    inspectCandidate: () => { throw rejection; },
    inspectPackage: () => { packageInspected = true; },
  }), (error) => error === rejection && !isRuntimePackageMissing(error));
  assert.equal(packageInspected, false);
  assert.throws(() => findRuntimePackage("broken", root, () => {}, { inspectPackage: () => { throw rejection; } }), (error) => error === rejection);
  file(join(broken, "package.json"), JSON.stringify({ name: "broken", exports: "./missing-entry.js" }));
  assert.throws(() => findRuntimePackage("broken", root, () => {}, { inspectPackage: () => { throw rejection; } }), (error) => error === rejection);
  const missingCandidates = [];
  let missingPackageInspected = false;
  assert.throws(() => findRuntimePackage("fixture-missing-hook-7d701ef1", root, () => {}, {
    inspectCandidate: (path) => { missingCandidates.push(path); },
    inspectPackage: () => { missingPackageInspected = true; },
  }), isRuntimePackageMissing);
  assert.equal(missingCandidates[0], join(root, "node_modules/fixture-missing-hook-7d701ef1"));
  assert.equal(missingPackageInspected, false);
});

test("metadata graph preserves nested versions, required peers and ordinary dependency cycles without executing providers", (t) => {
  const root = fixture(t);
  const a = pkg(root, "a", { dependencies: { b: "1", shared: "1" }, peerDependencies: { peer: "1" } });
  pkg(root, "b", { dependencies: { a: "1", shared: "2" } });
  pkg(a, "shared", { version: "1.0.0" });
  pkg(root, "shared", { version: "2.0.0" });
  pkg(root, "peer");
  const report = verifyRuntimeDependencyGraph(root, ["a", "b"]);
  assert.equal(report.packageCount, 5);
  assert.deepEqual(report.packages.filter((item) => item.name === "shared").map((item) => item.version).sort(), ["1.0.0", "2.0.0"]);
  assert.ok(report.edges.some((edge) => edge.kind === "peer" && edge.name === "peer"));
  assert.ok(report.edges.some((edge) => edge.name === "a" && edge.kind === "dependency"));
});

test("a whole missing root tree and missing mandatory dependency or peer are rejected", (t) => {
  const root = fixture(t);
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["fixture-missing-tree-7d701ef1"]), isRuntimePackageMissing);
  assert.throws(() => verifyRuntimeDependencyGraph(root, []), /generated manifest list/);
  pkg(root, "required", { dependencies: { "fixture-missing-dependency-7d701ef1": "1" } });
  pkg(root, "peer", { peerDependencies: { "fixture-missing-peer-7d701ef1": "1" } });
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["required"]), isRuntimePackageMissing);
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["peer"]), isRuntimePackageMissing);
});

test("physical npm polyfills named like Node builtins remain part of the dependency graph", (t) => {
  const root = fixture(t);
  pkg(root, "owner", { dependencies: { buffer: "1", events: "1" } });
  const buffer = pkg(root, "buffer"), events = pkg(root, "events");
  assert.equal(findRuntimePackage("buffer", root), buffer);
  assert.equal(findRuntimePackage("events", root), events);
  const report = verifyRuntimeDependencyGraph(root, ["owner"]);
  assert.equal(report.packageCount, 3);
  assert.ok(report.edges.some((edge) => edge.kind === "dependency" && edge.name === "buffer" && edge.to === buffer));
  assert.ok(report.edges.some((edge) => edge.kind === "dependency" && edge.name === "events" && edge.to === events));
});

test("only genuinely missing optionals are omitted, and optional dependencies override required declarations", (t) => {
  const root = fixture(t);
  pkg(root, "optional", { dependencies: { "fixture-optional-7d701ef1": "1" }, optionalDependencies: { "fixture-optional-7d701ef1": "1" },
    peerDependencies: { "fixture-optional-peer-7d701ef1": "1" }, peerDependenciesMeta: { "fixture-optional-peer-7d701ef1": { optional: true } } });
  assert.equal(verifyRuntimeDependencyGraph(root, ["optional"]).packageCount, 1);
  assert.equal(isRuntimePackageMissing(new Error("MODULE_NOT_FOUND")), false);
});

test("an existing optional with broken JSON, absent manifest or declared entry is never treated as missing", (t) => {
  const root = fixture(t);
  pkg(root, "owner", { optionalDependencies: { broken: "1" } });
  const broken = pkg(root, "broken");
  file(join(broken, "package.json"), "invalid JSON");
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["owner"]), /Invalid runtime package.json/);
  rmSync(join(broken, "package.json"));
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["owner"]), /has no package.json/);
  file(join(broken, "package.json"), JSON.stringify({ name: "broken", exports: { ".": "./absent.js" } }));
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["owner"]), /Cannot resolve declared runtime entry/);
  file(join(broken, "package.json"), JSON.stringify({ name: "broken", main: "absent.js" }));
  rmSync(join(broken, "index.js"));
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["owner"]), /Cannot resolve declared runtime entry/);
});

test("subpath-only, pure metadata and import-only packages remain valid without evaluating their entries", (t) => {
  const root = fixture(t);
  pkg(root, "subpath", { main: undefined, exports: { "./feature": "./index.js" } });
  pkg(root, "types", { main: undefined, types: "index.d.ts" });
  pkg(root, "import-only", { main: undefined, type: "module", exports: { ".": { types: "./not-executable.d.ts", import: "./index.mjs" } } });
  file(join(root, "node_modules/import-only/index.mjs"), "throw new Error('Do not import this provider');\n");
  const report = verifyRuntimeDependencyGraph(root, ["subpath", "types", "import-only"]);
  assert.equal(report.packageCount, 3);
  assert.deepEqual(report.importRequests, [{ specifier: "import-only", from: root, allowNoExport: true }]);
});

test("Node handles exports fallback arrays and percent-encoded entry paths without evaluating them", (t) => {
  const root = fixture(t);
  const fallback = pkg(root, "fallback", { exports: ["../invalid.js", "./index.js"] });
  const encoded = pkg(root, "encoded", { exports: "./entry%20file.js" });
  file(join(encoded, "entry file.js"), "throw new Error('Encoded provider entry must not execute');\n");
  assert.equal(findRuntimePackage("fallback", root), fallback);
  assert.equal(findRuntimePackage("encoded", root), encoded);
  assert.equal(verifyRuntimeDependencyGraph(root, ["fallback", "encoded"]).packageCount, 2);
});

test("Node rejects mixed subpath and condition export keys instead of accepting a hand-selected entry", (t) => {
  const root = fixture(t);
  pkg(root, "mixed", { exports: { ".": "./index.js", require: "./index.js" } });
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["mixed"]), (error) =>
    error.code === "ERR_RUNTIME_PACKAGE_INVALID" && error.cause?.code === "ERR_INVALID_PACKAGE_CONFIG");
});

test("import-only entry requests preserve the actual parent context for separate Node ESM resolution", (t) => {
  const root = fixture(t);
  const owner = pkg(root, "owner", { dependencies: { imported: "1" } });
  pkg(owner, "imported", { main: undefined, exports: { ".": { import: "./absent.mjs" } } });
  const report = verifyRuntimeDependencyGraph(root, ["owner"]);
  assert.deepEqual(report.importRequests, [
    { specifier: "owner", from: root, allowNoExport: true },
    { specifier: "imported", from: owner, allowNoExport: true },
  ]);
});

test("additional entrypoint contexts traverse a local shadow package and its required graph", (t) => {
  const root = fixture(t), entrypoint = join(root, "lib");
  pkg(root, "provider");
  const shadow = pkg(entrypoint, "provider", { version: "2.0.0", dependencies: { "fixture-shadow-required-7d701ef1": "1" } });
  assert.equal(verifyRuntimeDependencyGraph(root, ["provider"]).packageCount, 1);
  const requests = [{ name: "provider", from: entrypoint }];
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["provider"], requests), isRuntimePackageMissing);
  const dependency = pkg(entrypoint, "fixture-shadow-required-7d701ef1");
  const report = verifyRuntimeDependencyGraph(root, ["provider"], requests);
  assert.equal(report.packageCount, 3);
  assert.ok(report.edges.some((edge) => edge.kind === "entrypoint" && edge.name === "provider" && edge.from === entrypoint && edge.to === shadow));
  assert.ok(report.edges.some((edge) => edge.kind === "dependency" && edge.from === shadow && edge.to === dependency));
  assert.ok(report.importRequests.some((entry) => entry.specifier === "provider" && entry.from === entrypoint));
});

test("a local entrypoint package alias cannot resolve outside the artifact", (t) => {
  const parent = fixture(t), root = join(parent, "artifact"), entrypoint = join(root, "lib");
  pkg(root, "provider");
  const external = pkg(parent, "external-provider");
  file(join(external, "package.json"), "invalid JSON; containment must win");
  mkdirSync(join(entrypoint, "node_modules"), { recursive: true });
  symlinkSync(external, join(entrypoint, "node_modules/provider"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["provider"], [{ name: "provider", from: entrypoint }]), /escapes its artifact/);
});

test("additional entrypoint parents must be existing directories inside the artifact", (t) => {
  const parent = fixture(t), root = join(parent, "artifact");
  pkg(root, "provider");
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["provider"], [{ name: "provider", from: parent }]), /escapes its artifact/);
  symlinkSync(parent, join(root, "external-parent"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["provider"], [{ name: "provider", from: join(root, "external-parent") }]), /escapes its artifact/);
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["provider"], [{ name: "provider", from: join(root, "missing") }]), { code: "ENOENT" });
  file(join(root, "file-parent"), "not a directory");
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["provider"], [{ name: "provider", from: join(root, "file-parent") }]), /not a directory/);
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["provider"], {}), /entrypoint roots must be a list/);
});

test("parent node_modules and adjacent-prefix junctions are rejected before their manifest is parsed", (t) => {
  const parent = fixture(t), root = join(parent, "artifact"), neighbor = root + "-neighbor";
  mkdirSync(root);
  const outside = pkg(parent, "fixture-parent-7d701ef1");
  file(join(outside, "package.json"), "not JSON; containment must win");
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["fixture-parent-7d701ef1"]), /escapes its artifact/);
  mkdirSync(neighbor);
  file(join(neighbor, "package.json"), "not JSON; containment must win");
  mkdirSync(join(root, "node_modules"));
  symlinkSync(neighbor, join(root, "node_modules", "neighbor"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["neighbor"]), /escapes its artifact/);
});

test("internal package links are canonicalized and dependency cycles deduplicate the same package", (t) => {
  const root = fixture(t), store = join(root, "..assets");
  mkdirSync(store);
  const actual = pkg(store, "linked", { dependencies: { alias: "1" } });
  mkdirSync(join(root, "node_modules"));
  symlinkSync(actual, join(root, "node_modules", "alias"), process.platform === "win32" ? "junction" : "dir");
  assert.equal(findRuntimePackage("alias", root), actual);
  assert.equal(verifyRuntimeDependencyGraph(root, ["alias"]).packageCount, 1);
});

test("manifest links, optional links and declared entries cannot escape the artifact", (t) => {
  const parent = fixture(t), root = join(parent, "artifact"); mkdirSync(root);
  const external = pkg(parent, "outside");
  pkg(root, "owner", { optionalDependencies: { linked: "1" } });
  symlinkSync(external, join(root, "node_modules", "linked"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["owner"]), /escapes its artifact/);
  pkg(root, "bad-entry", { main: "../../../outside.js" });
  file(join(parent, "outside.js"), "throw new Error('outside code must not execute');");
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["bad-entry"]), /escapes its artifact/);
  const manifestLink = pkg(root, "manifest-link");
  rmSync(join(manifestLink, "package.json"));
  symlinkSync(external, join(manifestLink, "package.json"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["manifest-link"]), /escapes its artifact/);
  pkg(root, "invalid-export", { exports: { ".": "./../owner/index.js" } });
  assert.throws(() => verifyRuntimeDependencyGraph(root, ["invalid-export"]), /Cannot resolve declared runtime entry/);
});
