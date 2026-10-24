import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { probeStaticRuntimeImports, probeStaticRuntimeNative, STATIC_RUNTIME_NATIVE_CONTEXTS } from "./static-runtime-native-probe.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = resolve(appRoot, "../.tmp");
mkdirSync(temporaryRoot, { recursive: true });
const appRequire = createRequire(join(appRoot, "package.json"));
const ptyPackageRoot = dirname(appRequire.resolve("node-pty/package.json"));
const childSource = `
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
try {
  const report = (${probeStaticRuntimeNative.toString()})(process.argv[1], require, JSON.parse(process.argv[2]));
  console.log(JSON.stringify({report, restored: Module._resolveFilename === originalResolve}));
} catch (error) {
  console.log(JSON.stringify({error: {name: error.name, message: error.message, code: error.code}, restored: Module._resolveFilename === originalResolve}));
  process.exitCode = 1;
}
`;

function fixture(t) {
  const root = mkdtempSync(join(temporaryRoot, "static-native-probe-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(root, profile, contexts = {}) {
  mkdirSync(profile, { recursive: true });
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  for (const name of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"]) env[name] = profile;
  const child = spawnSync(process.execPath, ["-e", childSource, root, JSON.stringify(contexts)], {
    cwd: root, env, encoding: "utf8", windowsHide: true, timeout: 15000,
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.signal, null, child.stderr);
  assert.equal(child.stderr, "");
  const output = JSON.parse(child.stdout);
  assert.equal(output.restored, true, "Module resolution hook must be restored on success and failure");
  return { ...child, output };
}

function packageFile(root, name, source) {
  const directory = join(root, "node_modules", name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name, main: "index.js" }));
  writeFileSync(join(directory, "index.js"), source);
  return directory;
}

test("real installed dependencies load native addons without constructing a terminal", (t) => {
  const root = fixture(t);
  const child = run(appRoot, join(root, "profile"));
  assert.equal(child.status, 0, JSON.stringify(child.output));
  const { report } = child.output;
  assert.equal(report.ok, true);
  assert.equal(report.node, process.version);
  assert.equal(report.platform, process.platform);
  assert.equal(report.arch, process.arch);
  assert.deepEqual(report.modules.map(({ name }) => name), ["better-sqlite3", "node-pty", "ws", "playwright"]);
  const nativeNames = report.nativeAddons.map(({ path }) => path.split(/[\\/]/).at(-1));
  for (const name of process.platform === "win32" ? ["better_sqlite3.node", "conpty.node", "pty.node", "conpty_console_list.node"] : ["better_sqlite3.node", "pty.node"]) {
    assert.ok(nativeNames.includes(name), `Expected actual native load: ${name}`);
  }
  for (const entry of [...report.modules, ...report.nativeAddons]) {
    const rel = relative(realpathSync(appRoot), entry.path);
    assert.ok(rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel));
  }
  for (const addon of report.nativeAddons) {
    assert.ok(addon.bytes > 0);
    assert.match(addon.sha256, /^[a-f0-9]{64}$/);
  }
});

test("real dependencies load from the production service, terminal and browser contexts", (t) => {
  const root = fixture(t);
  const child = run(appRoot, join(root, "profile"), STATIC_RUNTIME_NATIVE_CONTEXTS);
  assert.equal(child.status, 0, JSON.stringify(child.output));
  assert.equal(child.output.report.ok, true);
  assert.deepEqual(child.output.report.modules.map(({ name }) => name), ["better-sqlite3", "node-pty", "ws", "playwright"]);
  for (const module of child.output.report.modules) {
    assert.equal(module.from, realpathSync(join(appRoot, STATIC_RUNTIME_NATIVE_CONTEXTS[module.name])));
  }
  assert.ok(child.output.report.nativeAddons.length >= (process.platform === "win32" ? 4 : 2));
});

test("the real node-pty JS wrapper cannot conceal missing native binaries", (t) => {
  const root = fixture(t);
  const app = join(root, "app");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), "{}");
  packageFile(app, "better-sqlite3", "module.exports = class { constructor(name) { if (name !== ':memory:') throw Error('disk DB forbidden'); } exec() {} close() {} };");
  const pty = join(app, "node_modules/node-pty");
  mkdirSync(pty);
  cpSync(join(ptyPackageRoot, "package.json"), join(pty, "package.json"));
  cpSync(join(ptyPackageRoot, "lib"), join(pty, "lib"), { recursive: true });
  const child = run(app, join(root, "profile"));
  assert.equal(child.status, 1);
  assert.match(child.output.error.message, /Failed to load native module: (?:conpty|pty)\.node/);
});

test("a terminal context shadow with missing native binaries cannot use a healthy root package", (t) => {
  const root = fixture(t);
  const terminal = join(root, "terminal-runtime");
  mkdirSync(terminal);
  writeFileSync(join(root, "package.json"), "{}");
  packageFile(root, "better-sqlite3", "module.exports = class { constructor(name) { if (name !== ':memory:') throw Error('disk DB forbidden'); } exec() {} close() {} };");
  const rootPty = join(root, "node_modules/node-pty");
  mkdirSync(rootPty, { recursive: true });
  cpSync(join(ptyPackageRoot, "package.json"), join(rootPty, "package.json"));
  for (const directory of ["lib", "build/Release", "build/Debug", `prebuilds/${process.platform}-${process.arch}`]) {
    const source = join(ptyPackageRoot, directory);
    if (existsSync(source)) cpSync(source, join(rootPty, directory), { recursive: true, filter: (file) => !file.endsWith(".pdb") });
  }
  const shadowPty = join(terminal, "node_modules/node-pty");
  mkdirSync(shadowPty, { recursive: true });
  cpSync(join(ptyPackageRoot, "package.json"), join(shadowPty, "package.json"));
  cpSync(join(ptyPackageRoot, "lib"), join(shadowPty, "lib"), { recursive: true });
  const child = run(root, join(root, "profile"), { "node-pty": "terminal-runtime" });
  assert.equal(child.status, 1);
  assert.match(child.output.error.message, /Failed to load native module: (?:conpty|pty)\.node/);
});

test("a service context dependency shadow cannot execute a package outside the app", (t) => {
  const root = fixture(t);
  const app = join(root, "app");
  const marker = join(root, "service-shadow-executed");
  mkdirSync(join(app, "lib/node_modules"), { recursive: true });
  writeFileSync(join(app, "package.json"), "{}");
  packageFile(app, "better-sqlite3", "module.exports = class { exec() {} close() {} };");
  const external = packageFile(root, "better-sqlite3", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); throw new Error('External shadow executed');`);
  symlinkSync(external, join(app, "lib/node_modules/better-sqlite3"), process.platform === "win32" ? "junction" : "dir");
  const child = run(app, join(root, "profile"), { "better-sqlite3": "lib" });
  assert.equal(child.status, 1);
  assert.match(child.output.error.message, /Runtime module resolves outside app directory/);
  assert.equal(existsSync(marker), false);
});

test("an external native loading context is rejected before probing that directory", (t) => {
  const root = fixture(t);
  const child = run(root, join(root, "profile"), { "better-sqlite3": "../missing-external-context" });
  assert.equal(child.status, 1);
  assert.match(child.output.error.message, /Runtime module resolves outside app directory/);
  assert.notEqual(child.output.error.code, "ENOENT");
});

test("parent node_modules is rejected before external module code executes", (t) => {
  const root = fixture(t);
  const app = join(root, "app");
  const marker = join(root, "external-module-executed");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), "{}");
  packageFile(root, "better-sqlite3", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); throw new Error('External package executed');`);
  const child = run(app, join(root, "profile"));
  assert.equal(child.status, 1);
  assert.match(child.output.error.message, /Runtime module resolves outside app directory/);
  assert.equal(existsSync(marker), false);
});

test("a module junction cannot redirect resolution outside the app", (t) => {
  const root = fixture(t);
  const app = join(root, "app");
  const marker = join(root, "redirected-module-executed");
  mkdirSync(join(app, "node_modules"), { recursive: true });
  writeFileSync(join(app, "package.json"), "{}");
  const external = packageFile(root, "better-sqlite3", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); throw new Error('Redirected package executed');`);
  symlinkSync(external, join(app, "node_modules/better-sqlite3"), process.platform === "win32" ? "junction" : "dir");
  const child = run(app, join(root, "profile"));
  assert.equal(child.status, 1);
  assert.match(child.output.error.message, /Runtime module resolves outside app directory/);
  assert.equal(existsSync(marker), false);
});

test("a native loader ABI error is preserved instead of reported as successful", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "package.json"), "{}");
  const directory = packageFile(root, "better-sqlite3", "module.exports = require('./invalid.node');");
  writeFileSync(join(directory, "invalid.node"), "synthetic invalid native binary");
  const child = run(root, join(root, "profile"));
  assert.equal(child.status, 1);
  assert.equal(child.output.error.code, "ERR_DLOPEN_FAILED");
  assert.match(child.output.error.message, /invalid\.node/);
});

test("SQLite query failure preserves the error, closes the memory DB and restores resolution", (t) => {
  const root = fixture(t);
  const marker = join(root, "database-closed");
  writeFileSync(join(root, "package.json"), "{}");
  packageFile(root, "better-sqlite3", `module.exports = class { constructor(name) { if (name !== ':memory:') throw Error('disk DB forbidden'); } exec() { const error = Error('fixture query failed'); error.code = 'FIXTURE_QUERY'; throw error; } close() { require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'closed'); } };`);
  const child = run(root, join(root, "profile"));
  assert.equal(child.status, 1);
  assert.equal(child.output.error.message, "fixture query failed");
  assert.equal(child.output.error.code, "FIXTURE_QUERY");
  assert.equal(readFileSync(marker, "utf8"), "closed");
});

const importChildSource = `
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
try {
  const report = (${probeStaticRuntimeImports.toString()})(process.argv[1], JSON.parse(process.argv[2]), require, (specifier, parent) => import.meta.resolve(specifier, parent));
  console.log(JSON.stringify({report}));
} catch (error) {
  console.log(JSON.stringify({error: {name: error.name, message: error.message, code: error.code}}));
  process.exitCode = 1;
}
`;

function runImports(root, requests) {
  const profile = join(root, "profile");
  mkdirSync(profile, { recursive: true });
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  for (const name of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"]) env[name] = profile;
  const child = spawnSync(process.execPath, ["--experimental-import-meta-resolve", "--input-type=module", "-e", importChildSource, root, JSON.stringify(requests)], {
    cwd: root, env, encoding: "utf8", windowsHide: true, timeout: 15000,
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.signal, null, child.stderr);
  assert.equal(child.stderr, "");
  return { ...child, output: JSON.parse(child.stdout) };
}

function importPackage(root, exports) {
  const directory = join(root, "node_modules/import-provider");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "import-provider", type: "module", exports }));
  return directory;
}

function forbiddenProvider(file, marker) {
  writeFileSync(file, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed'); throw new Error('Provider must not execute');`);
}

test("real ESM resolver accepts invalid-target array fallback without executing the provider", (t) => {
  const root = fixture(t);
  const directory = importPackage(root, ["../invalid-target.mjs", "./provider.mjs"]);
  const marker = join(root, "provider-executed");
  forbiddenProvider(join(directory, "provider.mjs"), marker);
  const child = runImports(root, [{ specifier: "import-provider", from: root }]);
  assert.equal(child.status, 0, JSON.stringify(child.output));
  assert.deepEqual(child.output.report, { ok: true, imports: [{ specifier: "import-provider", from: realpathSync(root), path: realpathSync(join(directory, "provider.mjs")) }] });
  assert.equal(existsSync(marker), false);
});

test("real ESM resolver decodes a valid percent-encoded space entry without executing it", (t) => {
  const root = fixture(t);
  const directory = importPackage(root, "./with%20space.mjs");
  const marker = join(root, "provider-executed");
  forbiddenProvider(join(directory, "with space.mjs"), marker);
  const child = runImports(root, [{ specifier: "import-provider", from: root }, { specifier: "node:fs", from: root }]);
  assert.equal(child.status, 0, JSON.stringify(child.output));
  assert.equal(child.output.report.imports.length, 1);
  assert.equal(child.output.report.imports[0].path, realpathSync(join(directory, "with space.mjs")));
  assert.equal(existsSync(marker), false);
});

test("real ESM resolver rejects mixed subpath and condition exports even when no-export is optional", (t) => {
  const root = fixture(t);
  importPackage(root, { ".": "./provider.mjs", import: "./provider.mjs" });
  const child = runImports(root, [{ specifier: "import-provider", from: root, allowNoExport: true }]);
  assert.equal(child.status, 1);
  assert.equal(child.output.error.code, "ERR_INVALID_PACKAGE_CONFIG");
});

test("an import-only missing file is rejected rather than using the require condition", (t) => {
  const root = fixture(t);
  const directory = importPackage(root, { import: "./missing.mjs", require: "./present.cjs" });
  const marker = join(root, "provider-executed");
  forbiddenProvider(join(directory, "present.cjs"), marker);
  const child = runImports(root, [{ specifier: "import-provider", from: root, allowNoExport: true }]);
  assert.equal(child.status, 1);
  assert.equal(child.output.error.code, "ENOENT");
  assert.match(child.output.error.message, /missing\.mjs/);
  assert.equal(existsSync(marker), false);
});

test("an exported known subpath must resolve to an existing file", (t) => {
  const root = fixture(t);
  importPackage(root, { "./feature": "./missing-feature.mjs" });
  const child = runImports(root, [{ specifier: "import-provider/feature", from: root, allowNoExport: true }]);
  assert.equal(child.status, 1);
  assert.equal(child.output.error.code, "ENOENT");
  assert.match(child.output.error.message, /missing-feature\.mjs/);
});

test("an ESM file URL outside the app is rejected without executing provider code", (t) => {
  const root = fixture(t);
  const app = join(root, "app");
  mkdirSync(app);
  const marker = join(root, "provider-executed");
  const external = join(root, "external.mjs");
  forbiddenProvider(external, marker);
  const child = runImports(app, [{ specifier: pathToFileURL(external).href, from: app }]);
  assert.equal(child.status, 1);
  assert.match(child.output.error.message, /Runtime import resolves outside app directory/);
  assert.equal(existsSync(marker), false);
});

test("a missing external ESM target is rejected by the lexical boundary before file inspection", (t) => {
  const root = fixture(t);
  const app = join(root, "app");
  mkdirSync(app);
  const child = runImports(app, [{ specifier: pathToFileURL(join(root, "missing-external.mjs")).href, from: app }]);
  assert.equal(child.status, 1);
  assert.match(child.output.error.message, /Runtime import resolves outside app directory/);
  assert.notEqual(child.output.error.code, "ENOENT");
});

test("a provider junction cannot redirect ESM resolution outside the app", (t) => {
  const root = fixture(t);
  const app = join(root, "app");
  mkdirSync(join(app, "node_modules"), { recursive: true });
  const directory = importPackage(root, "./provider.mjs");
  const marker = join(root, "provider-executed");
  forbiddenProvider(join(directory, "provider.mjs"), marker);
  symlinkSync(directory, join(app, "node_modules/import-provider"), process.platform === "win32" ? "junction" : "dir");
  const child = runImports(app, [{ specifier: "import-provider", from: app }]);
  assert.equal(child.status, 1);
  assert.match(child.output.error.message, /Runtime import resolves outside app directory/);
  assert.equal(existsSync(marker), false);
});

test("non-file ESM provider URLs are rejected", (t) => {
  const root = fixture(t);
  const child = runImports(root, [{ specifier: "data:text/javascript,throw%20new%20Error('executed')", from: root }]);
  assert.equal(child.status, 1);
  assert.match(child.output.error.message, /Unsupported runtime import URL/);
});

test("only explicitly optional ERR_PACKAGE_PATH_NOT_EXPORTED requests may be omitted", (t) => {
  const root = fixture(t);
  importPackage(root, { require: "./require-only.cjs" });
  const optional = runImports(root, [{ specifier: "import-provider", from: root, allowNoExport: true }]);
  assert.equal(optional.status, 0, JSON.stringify(optional.output));
  assert.deepEqual(optional.output.report, { ok: true, imports: [] });
  const required = runImports(root, [{ specifier: "import-provider", from: root }]);
  assert.equal(required.status, 1);
  assert.equal(required.output.error.code, "ERR_PACKAGE_PATH_NOT_EXPORTED");
});

test("require-only exports resolve in require mode without executing the provider", (t) => {
  const root = fixture(t);
  const directory = importPackage(root, { require: "./provider.cjs" });
  const marker = join(root, "require-provider-executed");
  writeFileSync(join(directory, "provider.cjs"), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); throw new Error('Provider must not execute');`);
  const required = runImports(root, [{ specifier: "import-provider", from: root, mode: "require" }, { specifier: "node:fs", from: root, mode: "require" }]);
  assert.equal(required.status, 0, JSON.stringify(required.output));
  assert.deepEqual(required.output.report, { ok: true, imports: [{ specifier: "import-provider", from: realpathSync(root), path: realpathSync(join(directory, "provider.cjs")) }] });
  const imported = runImports(root, [{ specifier: "import-provider", from: root, mode: "import" }]);
  assert.equal(imported.status, 1);
  assert.equal(imported.output.error.code, "ERR_PACKAGE_PATH_NOT_EXPORTED");
  assert.equal(existsSync(marker), false);
});

test("require mode rejects a missing exported subpath even when no-export is optional", (t) => {
  const root = fixture(t);
  importPackage(root, { "./feature": { require: "./missing-feature.cjs" } });
  const child = runImports(root, [{ specifier: "import-provider/feature", from: root, mode: "require", allowNoExport: true }]);
  assert.equal(child.status, 1);
  assert.equal(child.output.error.code, "MODULE_NOT_FOUND");
  assert.match(child.output.error.message, /missing-feature\.cjs/);
});

test("unsupported resolution modes fail instead of selecting an implicit resolver", (t) => {
  const root = fixture(t);
  const child = runImports(root, [{ specifier: "node:fs", from: root, mode: "unknown" }]);
  assert.equal(child.status, 1);
  assert.match(child.output.error.message, /Unsupported runtime import mode: unknown/);
});

test("ESM import targets must be regular files rather than directories", (t) => {
  const root = fixture(t);
  const directory = importPackage(root, "./directory");
  mkdirSync(join(directory, "directory"));
  const child = runImports(root, [{ specifier: "import-provider", from: root }]);
  assert.equal(child.status, 1);
  assert.match(child.output.error.message, /not a regular file/);
});
