import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { collectStaticSpaEvidence } from "./collect-static-spa-evidence.mjs";

const temporary = resolve(dirname(fileURLToPath(import.meta.url)), "../../.tmp");
function fixture(t) {
  mkdirSync(temporary, { recursive: true });
  const root = mkdtempSync(join(temporary, "spa-evidence-test-")), bucket = join(root, ".tmp/static-spa-ci"), generated = join(root, ".tmp/static-runtime-integration-fixture");
  mkdirSync(bucket, { recursive: true }); mkdirSync(generated);
  t.after(() => { const suffix = relative(temporary, root); assert.ok(suffix && !suffix.startsWith("..") && !suffix.includes(sep)); rmSync(root, { recursive: true, force: true }); });
  return { root, bucket, generated, output: join(bucket, "artifacts") };
}
const collect = (root) => collectStaticSpaEvidence({ repositoryDirectory: root, inspectMetadata() {} });
function mockFs(t, method, implementation) {
  const mock = t.mock.method(fs, method, implementation);
  syncBuiltinESMExports();
  t.after(() => { mock.mock.restore(); syncBuiltinESMExports(); });
}

test("only root PNGs and bounded diagnostic tails enter artifacts", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.bucket, "suite.log"), "s".repeat(300_000));
  writeFileSync(join(f.generated, "failure.png"), "generated fixture PNG");
  writeFileSync(join(f.generated, "primary-failure.txt"), "f".repeat(80_000));
  for (const folder of ["profile", "workspace", "relocated-app", "built-app"]) {
    mkdirSync(join(f.generated, folder)); writeFileSync(join(f.generated, folder, "must-not-upload.png"), "private fixture bytes");
  }
  writeFileSync(join(f.generated, "live-model-evidence.json"), '{"prompt":"not uploaded"}');
  writeFileSync(join(f.generated, "agent.db"), "not a real DB; must not upload");
  const report = collect(f.root), files = readdirSync(f.output);
  assert.equal(report.files.length, 3);
  assert.equal(readFileSync(join(f.output, "suite-tail.log")).length, 256 * 1024);
  assert.equal(readFileSync(join(f.output, "static-runtime-integration-fixture-primary-failure.txt")).length, 64 * 1024);
  assert.deepEqual(files.sort(), ["manifest.json", "static-runtime-integration-fixture-failure.png", "static-runtime-integration-fixture-primary-failure.txt", "suite-tail.log"].sort());
});

test("oversized PNGs and excess file counts are reported without exceeding the artifact budget", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.generated, "huge.png"), Buffer.alloc(5 * 1024 * 1024 + 1));
  for (let index = 0; index < 40; index++) writeFileSync(join(f.generated, `page-${index}.png`), "fixture");
  const report = collect(f.root);
  assert.equal(report.files.length, 32); assert.equal(report.omitted.length, 9);
  assert.ok(report.totalBytes <= 32 * 1024 * 1024);
});

test("a linked root screenshot cannot make the collector read another fixture tree", (t) => {
  const f = fixture(t), target = join(f.root, "owned-target"); mkdirSync(target);
  symlinkSync(target, join(f.generated, "failure.png"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => collect(f.root), /Invalid SPA evidence entry/);
  assert.equal(existsSync(join(f.output, "static-runtime-integration-fixture-failure.png")), false);
});

test("hard-linked evidence is omitted before payload reads with the default metadata inspector", (t) => {
  const f = fixture(t), profile = join(f.generated, "profile"); mkdirSync(profile);
  const privateFile = join(profile, "private-fixture.txt");
  writeFileSync(privateFile, JSON.stringify({ format: "static-spa-phase-timeline", version: 1,
    phases: [{ phase: "GENERATED_PRIVATE_PROFILE_FIXTURE_ONLY", elapsedMs: 1 }] }));
  for (const source of [join(f.bucket, "browser.log"), join(f.bucket, "suite.log"),
    ...["primary-failure.txt", "failure-dom.txt", "service-stderr.log", "phase-timeline.json", "failure.png"].map((leaf) => join(f.generated, leaf))])
    linkSync(privateFile, source);
  const actualRead = fs.readSync;
  let readBytes = 0;
  mockFs(t, "readSync", (...args) => { const read = actualRead(...args); readBytes += read; return read; });
  const report = collectStaticSpaEvidence({ repositoryDirectory: f.root });
  assert.equal(readBytes, 0);
  assert.equal(report.files.length, 0); assert.equal(report.omittedCount, 7);
  assert.ok(report.omitted.every(({ reason }) => reason === "hard-linked source"));
  assert.deepEqual(readdirSync(f.output), ["manifest.json"]);
});

test("a hardlink added after the path snapshot is omitted before payload reads", (t) => {
  const f = fixture(t), source = join(f.generated, "failure.png"), alias = join(f.generated, "private.txt");
  writeFileSync(source, "generated fixture");
  const actualLstat = fs.lstatSync, actualRead = fs.readSync;
  let linked = false, readBytes = 0;
  mockFs(t, "lstatSync", (path, ...args) => {
    const info = actualLstat(path, ...args);
    if (path === source && !linked) { linked = true; linkSync(source, alias); }
    return info;
  });
  mockFs(t, "readSync", (...args) => { const read = actualRead(...args); readBytes += read; return read; });
  const report = collect(f.root);
  assert.equal(linked, true); assert.equal(readBytes, 0);
  assert.equal(report.files.length, 0); assert.equal(report.omittedCount, 1);
  assert.match(report.omitted[0].reason, /source changed after inspection/);
  assert.deepEqual(readdirSync(f.output), ["manifest.json"]);
});

test("a hardlink added after open is omitted before payload reads", (t) => {
  const f = fixture(t), source = join(f.generated, "failure.png"), alias = join(f.generated, "private.txt");
  writeFileSync(source, "generated fixture");
  const actualOpen = fs.openSync, actualRead = fs.readSync;
  let linked = false, readBytes = 0;
  mockFs(t, "openSync", (path, ...args) => {
    const fd = actualOpen(path, ...args);
    if (path === source && !linked) { linked = true; linkSync(source, alias); }
    return fd;
  });
  mockFs(t, "readSync", (...args) => { const read = actualRead(...args); readBytes += read; return read; });
  const report = collect(f.root);
  assert.equal(linked, true); assert.equal(readBytes, 0);
  assert.equal(report.files.length, 0); assert.equal(report.omittedCount, 1);
  assert.match(report.omitted[0].reason, /source changed after inspection/);
  assert.deepEqual(readdirSync(f.output), ["manifest.json"]);
});

test("a hardlink added after the opened snapshot is rejected by the post-read check", (t) => {
  const f = fixture(t), source = join(f.generated, "failure.png"), alias = join(f.generated, "private.txt");
  const content = "generated fixture"; writeFileSync(source, content);
  const actualOpen = fs.openSync, actualFstat = fs.fstatSync, actualRead = fs.readSync;
  let sourceFd, linked = false, readBytes = 0;
  mockFs(t, "openSync", (path, ...args) => {
    const fd = actualOpen(path, ...args);
    if (path === source) sourceFd = fd;
    return fd;
  });
  mockFs(t, "fstatSync", (fd, ...args) => {
    const info = actualFstat(fd, ...args);
    if (fd === sourceFd && !linked) { linked = true; linkSync(source, alias); }
    return info;
  });
  mockFs(t, "readSync", (...args) => { const read = actualRead(...args); readBytes += read; return read; });
  const report = collect(f.root);
  assert.equal(linked, true); assert.equal(readBytes, Buffer.byteLength(content));
  assert.equal(report.files.length, 0); assert.equal(report.omittedCount, 1);
  assert.match(report.omitted[0].reason, /source changed during read/);
  assert.deepEqual(readdirSync(f.output), ["manifest.json"]);
});

test("a PNG growing from 1 byte to 6 MiB after inspection is omitted before any payload read", (t) => {
  const f = fixture(t), source = join(f.generated, "failure.png");
  writeFileSync(source, "x");
  const actualLstat = fs.lstatSync, actualRead = fs.readSync;
  let grew = false, readBytes = 0;
  mockFs(t, "lstatSync", (path, ...args) => {
    const info = actualLstat(path, ...args);
    if (path === source && !grew) { grew = true; writeFileSync(source, Buffer.alloc(6 * 1024 * 1024)); }
    return info;
  });
  mockFs(t, "readSync", (...args) => { const read = actualRead(...args); readBytes += read; return read; });
  const report = collect(f.root);
  assert.equal(grew, true); assert.equal(readBytes, 0);
  assert.equal(report.files.length, 0); assert.equal(report.omittedCount, 1);
  assert.match(report.omitted[0].reason, /source changed/);
  assert.equal(existsSync(join(f.output, "static-runtime-integration-fixture-failure.png")), false);
});

test("growth during fd reading cannot increase the buffer or upload a changed PNG", (t) => {
  const f = fixture(t), source = join(f.generated, "failure.png");
  writeFileSync(source, "x");
  const actualRead = fs.readSync;
  let grew = false, requestedBytes = 0, bufferBytes = 0;
  mockFs(t, "readSync", (...args) => {
    if (!grew) { grew = true; writeFileSync(source, Buffer.alloc(6 * 1024 * 1024)); }
    bufferBytes = Math.max(bufferBytes, args[1].length); requestedBytes += args[3];
    return actualRead(...args);
  });
  const report = collect(f.root);
  assert.equal(grew, true); assert.equal(bufferBytes, 1); assert.equal(requestedBytes, 1);
  assert.equal(report.files.length, 0); assert.equal(report.omittedCount, 1);
  assert.match(report.omitted[0].reason, /source changed during read/);
});

test("an inspected PNG replaced by a same-size file is omitted before reading the new inode", (t) => {
  const f = fixture(t), source = join(f.generated, "failure.png");
  writeFileSync(source, "x");
  const actualLstat = fs.lstatSync, actualRead = fs.readSync;
  let replaced = false, readBytes = 0;
  mockFs(t, "lstatSync", (path, ...args) => {
    const info = actualLstat(path, ...args);
    if (path === source && !replaced) { replaced = true; renameSync(source, source + ".old"); writeFileSync(source, "y"); }
    return info;
  });
  mockFs(t, "readSync", (...args) => { const read = actualRead(...args); readBytes += read; return read; });
  const report = collect(f.root);
  assert.equal(replaced, true); assert.equal(readBytes, 0);
  assert.equal(report.files.length, 0); assert.equal(report.omittedCount, 1);
  assert.match(report.omitted[0].reason, /source changed/);
});

test("the one phase timeline JSON is byte-bounded and rewritten to its exact diagnostic schema", (t) => {
  const f = fixture(t), source = join(f.generated, "phase-timeline.json");
  writeFileSync(source, JSON.stringify({ format: "static-spa-phase-timeline", version: 1,
    phases: [{ phase: "build-start", elapsedMs: 1, model: "must-not-upload" }], profile: "must-not-upload" }));
  writeFileSync(join(f.generated, "other.json"), JSON.stringify({ model: "must-not-read" }));
  const actualOpen = fs.openSync, opened = [];
  mockFs(t, "openSync", (path, ...args) => { if (args[0] === "r") opened.push(path); return actualOpen(path, ...args); });
  const report = collect(f.root), target = join(f.output, "static-runtime-integration-fixture-phase-timeline.json");
  assert.deepEqual(opened, [source], "The approved phase timeline is the only JSON source opened");
  assert.equal(report.files.length, 1);
  assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), { format: "static-spa-phase-timeline", version: 1,
    phases: [{ phase: "build-start", elapsedMs: 1 }] });
  assert.ok(readFileSync(target).length <= 16 * 1024);
  assert.equal(readFileSync(target, "utf8").includes("must-not-upload"), false);
});

test("oversized and invalid phase timelines are omitted without forwarding arbitrary JSON", (t) => {
  const actualRead = fs.readSync;
  let readBytes = 0;
  mockFs(t, "readSync", (...args) => { const read = actualRead(...args); readBytes += read; return read; });
  for (const content of [" ".repeat(16 * 1024 + 1), JSON.stringify({ format: "static-spa-phase-timeline", version: 1,
    phases: [{ phase: "build-start", elapsedMs: "not-a-number" }] })]) {
    const f = fixture(t);
    writeFileSync(join(f.generated, "phase-timeline.json"), content);
    const beforeRead = readBytes;
    const report = collect(f.root);
    if (content.length > 16 * 1024) assert.equal(readBytes, beforeRead, "An oversized phase timeline is omitted before payload reads");
    assert.equal(report.files.length, 0); assert.equal(report.omittedCount, 1);
    assert.match(report.omitted[0].reason, /phase/);
    assert.equal(existsSync(join(f.output, "static-runtime-integration-fixture-phase-timeline.json")), false);
  }
});

test("the Windows Tee pipeline preserves a failing native command exit code", { skip: process.platform !== "win32" }, (t) => {
  const f = fixture(t), log = join(f.bucket, "pipeline.log");
  const result = spawnSync("pwsh", ["-NoProfile", "-Command",
    `$ErrorActionPreference = 'Stop'\n& $env:SPA_CI_TEST_NODE -e "console.error('generated failure'); process.exit(7)" 2>&1 | Tee-Object -FilePath $env:SPA_CI_TEST_LOG\nexit $LASTEXITCODE`],
  { env: { ...process.env, SPA_CI_TEST_NODE: process.execPath, SPA_CI_TEST_LOG: log }, windowsHide: true, encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 7, result.stderr);
  assert.match(readFileSync(log, "utf8"), /generated failure/);
});
