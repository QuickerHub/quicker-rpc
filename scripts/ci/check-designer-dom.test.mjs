import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkDesignerDom } from "./check-designer-dom.mjs";

const temporary = resolve(dirname(fileURLToPath(import.meta.url)), "../../.tmp");
const edge = { channel: "msedge", headless: true, version: "fixture-edge" };
function fixture(t) {
  mkdirSync(temporary, { recursive: true });
  const root = mkdtempSync(join(temporary, "designer-dom-runner-test-"));
  t.after(() => {
    const suffix = relative(temporary, root);
    assert.ok(suffix && !suffix.startsWith("..") && !suffix.includes(sep));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
const receipt = (root) => {
  const bucket = join(root, ".tmp/designer-dom-ci");
  return JSON.parse(readFileSync(join(bucket, readdirSync(bucket)[0], "receipt.json"), "utf8"));
};
const options = (root) => ({ repositoryDirectory: root, inspectMetadata() {}, probeBrowser: async () => edge,
  runSuite: async () => ({ code: 0, signal: null }) });

test("the default browser port refuses local execution before loading Playwright", async (t) => {
  const root = fixture(t), previous = process.env.GITHUB_ACTIONS;
  let metadataCalls = 0;
  delete process.env.GITHUB_ACTIONS;
  try {
    await assert.rejects(checkDesignerDom({ repositoryDirectory: root, inspectMetadata() { metadataCalls++; },
      runSuite: async () => { assert.fail("A refused local probe cannot run the browser suite"); } }), /launches Edge only on a Windows GitHub Actions runner/);
    assert.equal(metadataCalls, 0);
    assert.equal(existsSync(join(root, ".tmp/designer-dom-ci")), false);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = previous;
  }
});

test("diagnostic directory redirects are rejected before browser or fixture writes", async (t) => {
  const root = fixture(t), target = join(root, "owned-target");
  mkdirSync(join(root, ".tmp")); mkdirSync(target);
  symlinkSync(target, join(root, ".tmp/designer-dom-ci"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(checkDesignerDom({ ...options(root), probeBrowser: async () => { assert.fail("Redirected diagnostics cannot launch a browser"); } }), /redirected/);
  assert.deepEqual(readdirSync(target), []);
});

test("a browser failure is retained and prevents running any DOM suite", async (t) => {
  const root = fixture(t); let calls = 0;
  await assert.rejects(checkDesignerDom({ ...options(root), probeBrowser: async () => { throw new Error("installed msedge is absent"); },
    runSuite: async () => { calls++; return { code: 0, signal: null }; } }), /installed msedge is absent/);
  assert.equal(calls, 0);
  const report = receipt(root);
  assert.equal(report.ok, false); assert.equal(report.phase, "browser-preflight");
  assert.match(report.error, /installed msedge is absent/);
});

test("browser substitution or an empty version cannot become a skipped success", async (t) => {
  const root = fixture(t);
  await assert.rejects(checkDesignerDom({ ...options(root), probeBrowser: async () => ({ channel: "chromium", headless: true, version: "" }),
    runSuite: async () => { assert.fail("DOM must not run with a substituted browser"); } }), /preflight/);
  assert.equal(receipt(root).ok, false);
});

test("Unicode failure details respect the receipt byte limit", async (t) => {
  const root = fixture(t);
  await assert.rejects(checkDesignerDom({ ...options(root), probeBrowser: async () => { throw new Error("中文🙂".repeat(20_000)); } }));
  const report = receipt(root);
  assert.ok(Buffer.byteLength(report.error) <= 16 * 1024);
  assert.equal(report.error.includes("\uFFFD"), false);
});

test("suite errors and signals remain blocking failures with bounded diagnostics", async (t) => {
  for (const result of [{ code: 1, signal: null }, { code: null, signal: "SIGTERM" }]) {
    const root = fixture(t);
    await assert.rejects(checkDesignerDom({ ...options(root), runSuite: async (_cwd, _env, output) => {
      output(Buffer.alloc(300_000, 97)); output("last assertion\n"); return result;
    } }), /regressions failed/);
    const report = receipt(root), tail = readFileSync(join(report.run, "diagnostic-tail.log"));
    assert.equal(report.ok, false); assert.deepEqual(report.result, result);
    assert.equal(tail.length, 256 * 1024); assert.ok(tail.toString().endsWith("last assertion\n"));
  }
});

test("the existing suite receives isolated screenshot paths and a successful receipt", async (t) => {
  const root = fixture(t);
  const report = await checkDesignerDom({ ...options(root), runSuite: async (cwd, env, output) => {
    assert.equal(cwd, join(root, "agent-gui"));
    assert.equal(env.QKRPC_ACTION_EDITOR_BROWSER_DIAGNOSTICS, "1");
    assert.match(relative(join(root, ".tmp/designer-dom-ci"), env.QKRPC_ACTION_EDITOR_SCREENSHOTS), /^run-[^/\\]+[/\\]screenshots[/\\]apde$/);
    assert.ok(env.WORKSPACE_DOCUMENT_SCREENSHOTS_DIR.endsWith(join("screenshots", "workspace")));
    output("fixture result\n"); return { code: 0, signal: null };
  } });
  assert.equal(report.ok, true); assert.equal(receipt(root).phase, "complete");
  assert.equal(report.production, false);
  assert.equal(report.browser.version, "fixture-edge");
  assert.equal(existsSync(join(report.run, "diagnostic-tail.log")), true);
});
