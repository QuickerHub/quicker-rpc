import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { stageRuntimePackages } from "./stage-runtime-packages.mjs";
import { createPackageSourceInspector } from "./runtime-package-source-files.mjs";
import { findRuntimePackage, isRuntimePackageMissing } from "./static-runtime-dependency-graph.mjs";

const temporary = resolve(dirname(fileURLToPath(import.meta.url)), "../../.tmp");
function fixture(t) {
  mkdirSync(temporary, { recursive: true });
  const path = mkdtempSync(join(temporary, "runtime-staging-"));
  t.after(() => {
    const suffix = relative(temporary, path);
    assert.ok(suffix && !suffix.startsWith("..") && !suffix.includes(sep));
    rmSync(path, { recursive: true, force: true });
  });
  return { path, source: join(path, "source"), app: join(path, "app") };
}
function file(path, content) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
function pkg(parent, name, identity = name, options = {}) {
  const directory = join(parent, "node_modules", name);
  file(join(directory, "package.json"), JSON.stringify({ name, version: "1.0.0", main: "index.js", ...options }));
  file(join(directory, "index.js"), "throw new Error('Staging must never evaluate provider code');\n");
  file(join(directory, "identity.txt"), identity);
  return directory;
}
function link(parent, name, target) {
  const path = join(parent, "node_modules", name);
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
  return path;
}
const identity = (name, from) => readFileSync(join(findRuntimePackage(name, from), "identity.txt"), "utf8");
// The graph fixtures still run all Node link/ownership/proof guards. Windows
// attribute checks have their own real PowerShell fixture coverage.
const stage = (names, app, source) => stageRuntimePackages(names, app, source, {
  sourceInspector: createPackageSourceInspector({ inspectMetadata() {} }),
});

for (const names of [["a", "b"], ["b", "a"]]) test(`direct roots retain their slot before nested versions: ${names}`, (t) => {
  const { source, app } = fixture(t);
  const a = pkg(source, "a", "a", { dependencies: { b: "1" } });
  pkg(a, "b", "b-nested"); pkg(source, "b", "b-direct");
  assert.equal(stage(names, app, source), 3);
  assert.equal(identity("b", app), "b-direct");
  assert.equal(identity("b", findRuntimePackage("a", app)), "b-nested");
});

test("an ancestor's nearer version cannot be replaced by a globally matching source", (t) => {
  const { path, source, app } = fixture(t);
  const x1 = pkg(source, "x", "x1");
  pkg(source, "b", "b0");
  const a = pkg(source, "a", "a", { dependencies: { b: "1", x: "2" } });
  pkg(a, "x", "x2");
  const b1 = pkg(join(path, "store"), "b", "b1", { dependencies: { x: "1" } });
  link(a, "b", b1); link(b1, "x", x1);
  assert.equal(identity("x", b1), "x1");
  stage(["a", "b", "x"], app, source);
  const stagedB = findRuntimePackage("b", findRuntimePackage("a", app));
  assert.equal(identity("b", app), "b0");
  assert.equal(identity("x", findRuntimePackage("a", app)), "x2");
  assert.equal(identity("x", stagedB), "x1");
});

test("all sibling slots are reserved before a descendant chooses its dependencies", (t) => {
  const { path, source, app } = fixture(t);
  const x1 = pkg(source, "x", "x1");
  const a = pkg(source, "a", "a", { dependencies: { b: "1", x: "2" } });
  pkg(a, "x", "x2");
  const b = pkg(join(path, "store"), "b", "b", { dependencies: { x: "1" } });
  link(a, "b", b); link(b, "x", x1);
  stage(["a", "x"], app, source);
  const stagedA = findRuntimePackage("a", app), stagedB = findRuntimePackage("b", stagedA);
  assert.equal(identity("x", stagedA), "x2");
  assert.equal(identity("x", stagedB), "x1");
});

test("required peers, alias names and optional overrides share the verifier's edge semantics", (t) => {
  const { source, app } = fixture(t);
  pkg(source, "owner", "owner", {
    dependencies: { "fixture-absent-8ff9": "1", alias: "npm:actual@1" },
    optionalDependencies: { "fixture-absent-8ff9": "1" },
    peerDependencies: { peer: "1", "fixture-absent-peer-8ff9": "1" },
    peerDependenciesMeta: { "fixture-absent-peer-8ff9": { optional: true } },
  });
  pkg(source, "alias", "actual-bytes", { name: "actual" }); pkg(source, "peer");
  assert.equal(stage(["owner"], app, source), 3);
  const owner = findRuntimePackage("owner", app);
  assert.equal(identity("alias", owner), "actual-bytes");
  assert.equal(identity("peer", owner), "peer");
  assert.throws(() => findRuntimePackage("fixture-absent-8ff9", owner), isRuntimePackageMissing);
});

test("normal dependency cycles close through visible ancestors", (t) => {
  const { source, app } = fixture(t);
  pkg(source, "a", "a", { dependencies: { b: "1" } });
  pkg(source, "b", "b", { dependencies: { a: "1" } });
  assert.equal(stage(["a"], app, source), 2);
  const a = findRuntimePackage("a", app), b = findRuntimePackage("b", a);
  assert.equal(findRuntimePackage("a", b), a);
});

test("a renamed self dependency can close after one necessary nested copy", (t) => {
  const { path, source, app } = fixture(t);
  const a = pkg(join(path, "store"), "actual", "actual", { dependencies: { actual: "1" } });
  link(a, "actual", a); link(source, "alias", a);
  assert.equal(stage(["alias"], app, source), 2);
  const alias = findRuntimePackage("alias", app), nested = findRuntimePackage("actual", alias);
  assert.equal(identity("actual", nested), "actual");
});

test("incompatible interleaved version cycles fail before any artifact is copied", (t) => {
  const { path, source, app } = fixture(t), store = join(path, "store");
  const a1 = pkg(join(store, "a1"), "a", "a1", { dependencies: { b: "1" } });
  const a2 = pkg(join(store, "a2"), "a", "a2", { dependencies: { b: "2" } });
  const b1 = pkg(join(store, "b1"), "b", "b1", { dependencies: { a: "2" } });
  const b2 = pkg(join(store, "b2"), "b", "b2", { dependencies: { a: "1" } });
  link(a1, "b", b1); link(b1, "a", a2); link(a2, "b", b2); link(b2, "a", a1);
  link(source, "a", a1);
  assert.throws(() => stage(["a"], app, source), /cycle cannot be staged/);
  assert.equal(existsSync(app), false);
});

test("an optional missing from one caller remains absent when another caller needs that name", (t) => {
  const { path, source, app } = fixture(t);
  pkg(source, "a", "a", { optionalDependencies: { "fixture-optional-8ff9": "1" } });
  const b = pkg(source, "b", "b", { dependencies: { "fixture-optional-8ff9": "1" } });
  const optional = pkg(join(path, "store"), "fixture-optional-8ff9"); link(b, "fixture-optional-8ff9", optional);
  assert.equal(stage(["a", "b"], app, source), 3);
  assert.throws(() => findRuntimePackage("fixture-optional-8ff9", findRuntimePackage("a", app)), isRuntimePackageMissing);
  assert.equal(identity("fixture-optional-8ff9", findRuntimePackage("b", app)), "fixture-optional-8ff9");
});

test("an incompatible direct root cannot silently turn a missing source optional into a present one", (t) => {
  const { path, source, app } = fixture(t);
  const a = pkg(join(path, "store"), "a", "a", { optionalDependencies: { "fixture-optional-8ff9": "1" } });
  link(source, "a", a); pkg(source, "fixture-optional-8ff9");
  assert.throws(() => stage(["a", "fixture-optional-8ff9"], app, source), /resolution changed/);
  assert.equal(existsSync(app), false);
});

test("a broken existing optional is rejected before writing any destination", (t) => {
  const { source, app } = fixture(t);
  pkg(source, "owner", "owner", { optionalDependencies: { broken: "1" } });
  const broken = pkg(source, "broken"); file(join(broken, "package.json"), "{invalid");
  assert.throws(() => stage(["owner"], app, source), /JSON|manifest/i);
  assert.equal(existsSync(app), false);
});

test("the producer uses the same extracted staging function", async () => {
  const producer = await import("./build-static-runtime.mjs");
  assert.equal(producer.stageRuntimePackages, stageRuntimePackages);
});

test("metadata resources are released after successful staging and source rejection", (t) => {
  for (const reject of [false, true]) {
    const { source, app } = fixture(t); pkg(source, "owner");
    let disposed = 0;
    const metadata = () => {};
    metadata.dispose = () => { disposed++; };
    const options = { sourceInspector: createPackageSourceInspector({ inspectMetadata: metadata }) };
    const run = () => stageRuntimePackages([reject ? "fixture-missing-root-8ff9" : "owner"], app, source, options);
    if (reject) assert.throws(run, isRuntimePackageMissing);
    else assert.equal(run(), 1);
    assert.equal(disposed, 1);
  }
});

test("an existing package tree or user data cannot be overwritten", (t) => {
  const { source, app } = fixture(t); pkg(source, "owner");
  for (const name of ["node_modules", ".local", "agent.db", "agent.db.writer.sqlite"]) {
    const target = join(app, name); file(join(target, "preserve.txt"), "user bytes");
    assert.throws(() => stage(["owner"], app, source), /existing runtime content/);
    assert.equal(readFileSync(join(target, "preserve.txt"), "utf8"), "user bytes");
    rmSync(target, { recursive: true });
  }
});

test("destination junctions and source/output overlap are rejected", (t) => {
  const { path, source, app } = fixture(t); const owner = pkg(source, "owner");
  const outside = join(path, "outside"); mkdirSync(outside);
  symlinkSync(outside, app, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => stage(["owner"], app, source), /redirect|metadata/i);
  assert.equal(existsSync(join(outside, "node_modules")), false);
  assert.throws(() => stage(["owner"], join(owner, "output"), source), /overlaps/);
});

test("an internal source junction is materialized and remains valid after relocation", (t) => {
  const { path, source, app } = fixture(t); const owner = pkg(source, "owner");
  file(join(owner, "payload/value.txt"), "local payload");
  symlinkSync(join(owner, "payload"), join(owner, "alias"), process.platform === "win32" ? "junction" : "dir");
  stage(["owner"], app, source);
  const relocated = join(path, "relocated-app"); renameSync(app, relocated);
  const copy = findRuntimePackage("owner", relocated);
  assert.equal(lstatSync(join(copy, "alias")).isSymbolicLink(), false);
  assert.equal(readFileSync(join(copy, "alias/value.txt"), "utf8"), "local payload");
  assert.equal(realpathSync(copy), copy);
});
