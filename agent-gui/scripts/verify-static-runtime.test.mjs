import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createNativeProbeEnvironment, inspectStaticRuntime, verifyStaticRuntime } from "./verify-static-runtime.mjs";

const temporary = resolve(dirname(fileURLToPath(import.meta.url)), "../../.tmp");
mkdirSync(temporary, { recursive: true });

function fixture(t) {
  const parent = mkdtempSync(join(temporary, "runtime-verifier-test-")), root = join(parent, "app");
  mkdirSync(root);
  const write = (file, text = "fixture") => {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  const manifest = { format: "quicker-agent-static-runtime", version: 1, next: false, runtimePackageRoots: ["example"], runtimeImports: [{ specifier: "example", from: "lib", mode: "import" }], rendererFiles: ["assets/main.js", "assets/main.css"] };
  write("runtime-manifest.json", JSON.stringify(manifest));
  write("package.json", "{}");
  for (const file of ["service.mjs", "lib/service-main.mjs", "drizzle/migrations/meta/_journal.json", "docs/skills/quicker-authoring/SKILL.md", "docs/skills/quicker-eval-expression/SKILL.md", "browser-runtime/server.mjs", "terminal-runtime/server.mjs", "lib/qkrpc-bin.mjs", "lib/qkrpc-toolchain-env.mjs"]) write(file);
  write("renderer/index.html", '<script type="module" src="/assets/main.js"></script><link rel="stylesheet" href="/assets/main.css">');
  write("renderer/assets/main.js", "export {};\n");
  write("renderer/assets/main.css", ":root {}\n");
  write("node_modules/example/package.json", JSON.stringify({ name: "example", version: "1.0.0", main: "index.js" }));
  write("node_modules/example/index.js", 'throw Error("metadata validation must not execute providers");');
  t.after(() => {
    const suffix = relative(realpathSync(temporary), realpathSync(parent));
    assert.ok(suffix && suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix));
    rmSync(parent, { recursive: true, force: true });
  });
  return { root, parent, manifest, write };
}

test("structure checks entry JS/CSS and does not reject an internal ..assets name", (t) => {
  const { root, write } = fixture(t);
  write("..assets/extra.txt");
  const report = inspectStaticRuntime(root);
  assert.equal(report.root, realpathSync(root));
  assert.deepEqual(report.rendererAssets, ["/assets/main.js", "/assets/main.css"]);
});

for (const [name, tag, missing] of [
  ["JS", '<script src="/assets/missing.js"></script>', "missing.js"],
  ["CSS", '<link rel="stylesheet" href="/assets/missing.css">', "missing.css"],
]) {
  test(`missing renderer ${name} fails before any native child`, async (t) => {
    const { root, write } = fixture(t);
    write("renderer/index.html", tag);
    const mock = t.mock.method(childProcess, "spawnSync", () => { throw Error("must not spawn"); });
    syncBuiltinESMExports();
    try {
      await assert.rejects(verifyStaticRuntime(root), (error) => error.message.includes(missing));
      assert.equal(mock.mock.callCount(), 0);
    } finally { mock.mock.restore(); syncBuiltinESMExports(); }
  });
}

test("resource and manifest links outside the artifact fail before their contents are read", (t) => {
  const { root, parent } = fixture(t);
  const outside = join(parent, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "marker.json"), "invalid JSON which must never be parsed");
  symlinkSync(outside, join(root, "external"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => inspectStaticRuntime(root), /Runtime resource escapes its directory/);
});

test("required resource directories do not count as files", (t) => {
  const { root } = fixture(t);
  rmSync(join(root, "service.mjs"));
  mkdirSync(join(root, "service.mjs"));
  assert.throws(() => inspectStaticRuntime(root), /resource is not a file: service.mjs/);
});

test("the generated file inventory catches a missing lazy renderer chunk", (t) => {
  const { root, manifest, write } = fixture(t);
  manifest.rendererFiles.push("assets/lazy-chunk.js");
  write("runtime-manifest.json", JSON.stringify(manifest));
  assert.throws(() => inspectStaticRuntime(root), /Missing static runtime resource: assets[/\\]lazy-chunk.js/);
});

test("stylesheet-only HTML cannot hide a missing renderer module entry", (t) => {
  const { root, write } = fixture(t);
  write("renderer/index.html", '<link rel = "stylesheet" href = "/assets/main.css">');
  assert.throws(() => inspectStaticRuntime(root), /no module script entry/);
  write("renderer/index.html", '<script type = "module" src = "/assets/main.js"></script>');
  assert.deepEqual(inspectStaticRuntime(root).rendererAssets, ["/assets/main.js"]);
});

test("legacy manifests must be rebuilt with explicit runtime dependency roots", (t) => {
  const { root, manifest, write } = fixture(t);
  delete manifest.runtimePackageRoots;
  write("runtime-manifest.json", JSON.stringify(manifest));
  assert.throws(() => inspectStaticRuntime(root), /no dependency roots; rebuild/);
});

test("a whole missing dependency cannot be supplied by parent node_modules", async (t) => {
  const { root, parent } = fixture(t);
  const source = join(root, "node_modules"), target = join(parent, "node_modules");
  assert.equal(realpathSync(dirname(source)), realpathSync(root));
  assert.equal(realpathSync(dirname(target)), realpathSync(parent));
  assert.equal(existsSync(target), false);
  renameSync(source, target);
  const mock = t.mock.method(childProcess, "spawnSync", () => { throw Error("must not spawn"); });
  syncBuiltinESMExports();
  try {
    await assert.rejects(verifyStaticRuntime(root), /Runtime dependency escapes its artifact/);
    assert.equal(mock.mock.callCount(), 0);
  } finally { mock.mock.restore(); syncBuiltinESMExports(); }
});

test("a known backend subpath must resolve before any native load or provider execution", async (t) => {
  const { root, manifest, write } = fixture(t);
  manifest.runtimeImports = [{ specifier: "example/feature", from: "lib", mode: "import" }];
  write("runtime-manifest.json", JSON.stringify(manifest));
  write("node_modules/example/package.json", JSON.stringify({ name: "example", exports: { ".": "./index.js", "./feature": "./absent-feature.js" } }));
  const originalSpawn = childProcess.spawnSync;
  const mock = t.mock.method(childProcess, "spawnSync", (executable, args, options) => {
    assert.equal(args[0], "--experimental-import-meta-resolve", "native child must not start after import validation fails");
    return originalSpawn(executable, args, options);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(verifyStaticRuntime(root), /absent-feature\.js/);
    assert.equal(mock.mock.callCount(), 1);
  } finally { mock.mock.restore(); syncBuiltinESMExports(); }
});

test("copied terminal ESM imports cannot use a require-only ws shadow", async (t) => {
  const { root, manifest, write } = fixture(t);
  manifest.runtimePackageRoots.push("ws");
  manifest.runtimeImports.push({ specifier: "ws", from: "terminal-runtime", mode: "import" });
  write("runtime-manifest.json", JSON.stringify(manifest));
  write("node_modules/ws/package.json", JSON.stringify({ name: "ws", exports: { import: "./index.mjs", require: "./index.cjs" } }));
  write("node_modules/ws/index.mjs", 'throw Error("do not execute");');
  write("node_modules/ws/index.cjs", 'throw Error("do not execute");');
  write("terminal-runtime/node_modules/ws/package.json", JSON.stringify({ name: "ws", exports: { require: "./index.cjs" } }));
  write("terminal-runtime/node_modules/ws/index.cjs", 'throw Error("do not execute");');
  const originalSpawn = childProcess.spawnSync;
  const mock = t.mock.method(childProcess, "spawnSync", (executable, args, options) => {
    assert.equal(args[0], "--experimental-import-meta-resolve");
    return originalSpawn(executable, args, options);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(verifyStaticRuntime(root), /ERR_PACKAGE_PATH_NOT_EXPORTED/);
    assert.equal(mock.mock.callCount(), 1);
  } finally { mock.mock.restore(); syncBuiltinESMExports(); }
});

test("probe environment removes Node injections and uses an isolated profile", () => {
  const input = { NODE_PATH: "outside-modules", node_options: "--require=outside.cjs", HOME: "real-home", KEEP: "value" };
  const env = createNativeProbeEnvironment("dedicated-profile", input);
  assert.equal(env.NODE_PATH, undefined);
  assert.equal(env.node_options, undefined);
  for (const name of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "QUICKER_AGENT_DATA_DIR"]) assert.equal(env[name], "dedicated-profile");
  assert.equal(env.KEEP, "value");
  assert.equal(env.AGENT_GUI_SKIP_QKRPC, "1");
  assert.equal(input.HOME, "real-home");
});

for (const [name, result, diagnostic] of [
  ["ABI error", { status: 1, stderr: "ERR_DLOPEN_FAILED: NODE_MODULE_VERSION mismatch" }, /NODE_MODULE_VERSION mismatch/],
  ["timeout", { status: null, error: new Error("ETIMEDOUT") }, /ETIMEDOUT/],
  ["old success marker", { status: 0, stdout: "native-runtime-ok" }, /Invalid native runtime probe report/],
]) {
  test(`probe ${name} blocks validation and cleans its owned profile`, async (t) => {
    const { root } = fixture(t);
    let profile;
    const mock = t.mock.method(childProcess, "spawnSync", (executable, args, options) => {
      assert.equal(executable, process.execPath);
      assert.equal(options.timeout, 15000);
      assert.equal(options.windowsHide, true);
      profile = options.env.HOME;
      assert.ok(existsSync(profile));
      assert.equal(options.env.NODE_PATH, undefined);
      assert.equal(options.env.NODE_OPTIONS, undefined);
      if (args[0] === "--experimental-import-meta-resolve") {
        assert.equal(args[4], realpathSync(root));
        const exactImport = JSON.parse(options.input).find((entry) => entry.specifier === "example" && !entry.allowNoExport);
        assert.equal(exactImport.from, join(realpathSync(root), "lib"));
        return { status: 0, stdout: JSON.stringify({ ok: true, imports: [{ specifier: "example", from: root, path: join(root, "node_modules/example/index.js") }] }) };
      }
      assert.equal(args[0], "-e");
      assert.equal(args[2], realpathSync(root));
      return result;
    });
    syncBuiltinESMExports();
    try {
      await assert.rejects(verifyStaticRuntime(root), diagnostic);
      assert.equal(mock.mock.callCount(), 2);
      assert.equal(existsSync(profile), false);
    } finally { mock.mock.restore(); syncBuiltinESMExports(); }
  });
}
