import { spawn } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createWindowsPackageMetadataInspector } from "../../agent-gui/scripts/runtime-package-metadata.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tailLimit = 256 * 1024;
const errorLimit = 16 * 1024;

function physicalDirectory(path) {
  if (/(?:^|[/\\])(?:OneDrive[^/\\]*|Dropbox|iCloud[^/\\]*)(?:[/\\]|$)/i.test(path)) throw new Error("Designer diagnostics cannot use cloud directories");
  const ancestors = [];
  for (let cursor = path; ; cursor = dirname(cursor)) {
    ancestors.push(cursor);
    if (dirname(cursor) === cursor) break;
  }
  for (const cursor of ancestors.reverse()) {
    try {
      const entry = lstatSync(cursor);
      if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`Designer diagnostics directory is redirected: ${cursor}`);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

function hostedWindowsOnly() {
  if (process.platform !== "win32" || process.env.GITHUB_ACTIONS !== "true")
    throw new Error("The designer DOM CI runner launches Edge only on a Windows GitHub Actions runner; use isolated ports for local checks");
}

async function installedEdge(agentRoot) {
  hostedWindowsOnly();
  // Use the same installed channel as the existing specs. Never download or
  // silently substitute another browser when the hosted image changes.
  await import(pathToFileURL(join(agentRoot, "scripts/agent-offline-network-guard.mjs")).href);
  const { chromium } = createRequire(join(agentRoot, "package.json"))("playwright");
  const browser = await chromium.launch({ channel: "msedge", headless: true, timeout: 15_000 });
  try { return { channel: "msedge", headless: true, version: browser.version() }; }
  finally { await browser.close(); }
}

function existingSuite(agentRoot, env, output) {
  hostedWindowsOnly();
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [join(agentRoot, "scripts/check-action-designer.mjs")], {
      cwd: agentRoot, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => { process.stdout.write(chunk); output(chunk); });
    child.stderr.on("data", (chunk) => { process.stderr.write(chunk); output(chunk); });
    child.once("error", reject);
    child.once("close", (code, signal) => resolveResult({ code, signal }));
  });
}

/** CI orchestration only: the browser spec registry and deadlines have one owner. */
export async function checkDesignerDom({ repositoryDirectory = repository, probeBrowser = installedEdge,
  runSuite = existingSuite, inspectMetadata = createWindowsPackageMetadataInspector() } = {}) {
  const selected = resolve(repositoryDirectory), temporary = join(selected, ".tmp"), bucket = join(temporary, "designer-dom-ci");
  let run;
  try {
    if (probeBrowser === installedEdge || runSuite === existingSuite) hostedWindowsOnly();
    inspectMetadata([selected, temporary, bucket]);
    physicalDirectory(bucket);
    if (realpathSync(selected) !== selected) throw new Error("Designer CI repository is not canonical");
    mkdirSync(bucket, { recursive: true });
    inspectMetadata([bucket]); physicalDirectory(bucket);
    run = mkdtempSync(join(bucket, "run-"));
    inspectMetadata([run]); physicalDirectory(run);
  } finally { inspectMetadata.dispose?.(); }
  const agentRoot = join(selected, "agent-gui"), started = Date.now();
  const report = { format: "quicker-designer-dom-ci", version: 1, ok: false, phase: "browser-preflight", run,
    production: probeBrowser === installedEdge && runSuite === existingSuite,
    sourceRevision: process.env.GITHUB_SHA ?? null,
    nodeVersion: process.version, imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null,
    runner: "agent-gui/scripts/check-action-designer.mjs", screenshotRoots: ["screenshots/apde", "screenshots/workspace"],
    diagnosticLimitBytes: tailLimit, browser: null };
  let tail = Buffer.alloc(0);
  const output = (chunk) => {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    tail = next.length >= tailLimit ? Buffer.from(next.subarray(next.length - tailLimit))
      : Buffer.concat([tail.subarray(Math.max(0, tail.length + next.length - tailLimit)), next]);
  };
  const save = () => {
    physicalDirectory(run);
    report.elapsedMs = Date.now() - started;
    writeFileSync(join(run, "diagnostic-tail.log"), tail);
    writeFileSync(join(run, "receipt.json"), JSON.stringify(report, null, 2) + "\n");
  };
  try {
    save();
    report.browser = await probeBrowser(agentRoot);
    if (report.browser?.channel !== "msedge" || report.browser.headless !== true || typeof report.browser.version !== "string" || !report.browser.version)
      throw new Error("Installed Microsoft Edge preflight did not return a valid headless version");
    console.log(`Designer DOM installed Edge: ${JSON.stringify(report.browser)}`);
    report.phase = "dom-regressions"; save();
    report.result = await runSuite(agentRoot, { ...process.env,
      QKRPC_ACTION_EDITOR_BROWSER_DIAGNOSTICS: "1",
      QKRPC_ACTION_EDITOR_SCREENSHOTS: join(run, "screenshots/apde"),
      WORKSPACE_DOCUMENT_SCREENSHOTS_DIR: join(run, "screenshots/workspace"),
    }, output);
    if (report.result?.code !== 0 || report.result.signal) throw new Error(`Designer DOM regressions failed: exit ${report.result?.code}, signal ${report.result?.signal ?? "none"}`);
    report.phase = "complete"; report.ok = true; save();
    console.log(`Designer DOM gate passed in ${report.elapsedMs}ms. Receipt: ${join(run, "receipt.json")}`);
    return report;
  } catch (error) {
    const bytes = Buffer.from(String(error?.stack ?? error));
    report.error = new TextDecoder().decode(bytes.subarray(0, errorLimit), { stream: true });
    save();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkDesignerDom().catch((error) => { console.error(error); process.exitCode = 1; });
}
