import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

test("the Windows Tee pipeline preserves a failing native command exit code", { skip: process.platform !== "win32" }, (t) => {
  const f = fixture(t), log = join(f.bucket, "pipeline.log");
  const result = spawnSync("pwsh", ["-NoProfile", "-Command",
    `& $env:SPA_CI_TEST_NODE -e "console.error('generated failure'); process.exit(7)" 2>&1 | Tee-Object -FilePath $env:SPA_CI_TEST_LOG\nexit $LASTEXITCODE`],
  { env: { ...process.env, SPA_CI_TEST_NODE: process.execPath, SPA_CI_TEST_LOG: log }, windowsHide: true, encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 7, result.stderr);
  assert.match(readFileSync(log, "utf8"), /generated failure/);
});
