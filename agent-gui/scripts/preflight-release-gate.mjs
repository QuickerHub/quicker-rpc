/**
 * Fast release gate (<10s warm). Catches cross-layer drift and launcher regressions
 * before expensive `next build` / Electron NSIS bundle.
 *
 * Usage: node scripts/preflight-release-gate.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(agentGuiRoot, "..");

/** Curated tests — avoid `lib/launcher/*.test.ts` glob (pulls full launcher suite). */
const RELEASE_GATE_TESTS = [
  "lib/launcher/launcher-shortcut-contract.test.ts",
  "lib/launcher/launcher-shortcut-format.test.ts",
  "lib/launcher/launcher-prefs.test.ts",
  "lib/launcher/sync-launcher-global-shortcut.test.ts",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function semver3(version) {
  const parts = String(version ?? "")
    .trim()
    .replace(/^v/i, "")
    .split(".");
  if (parts.length < 3) {
    throw new Error(`invalid semver (need X.Y.Z): ${version}`);
  }
  return parts.slice(0, 3).join(".");
}

function runStep(label, fn) {
  const started = Date.now();
  fn();
  const elapsedMs = Date.now() - started;
  console.log(`preflight-release-gate: ok ${label} (${elapsedMs}ms)`);
  return elapsedMs;
}

function checkVersionNotes() {
  const versionJson = readJson(join(repoRoot, "version.json"));
  const pkg = readJson(join(agentGuiRoot, "package.json"));
  const expected = semver3(versionJson.QuickerRpc);
  const current = String(pkg.version ?? "").trim();

  if (!current) {
    throw new Error("agent-gui package.json missing version");
  }
  if (current !== expected) {
    console.log(
      `preflight-release-gate: note package.json=${current}, version.json semver=${expected} (electron:prepare syncs before build)`,
    );
  }
}

function runReleaseGateTests() {
  const args = ["--test", ...RELEASE_GATE_TESTS];
  const result = spawnSync("pnpm", ["exec", "tsx", ...args], {
    cwd: agentGuiRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`release gate tests failed (exit ${result.status ?? "unknown"})`);
  }
}

function checkNsisInstallerAssets() {
  const electronScript = join(agentGuiRoot, "scripts", "verify-electron-installer-assets.mjs");
  const result = spawnSync("node", [electronScript], {
    cwd: agentGuiRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`Electron NSIS installer asset check failed (exit ${result.status ?? "unknown"})`);
  }
}

function maybeRunRustShortcutTest() {
  if (process.env.PREFLIGHT_RUST !== "1") {
    console.log(
      "preflight-release-gate: skip rust shortcut test (optional; TS contract already checks DEFAULT)",
    );
    return;
  }

  const result = spawnSync(
    "cargo",
    ["test", "global_shortcut", "--quiet", "--manifest-path", join(agentGuiRoot, "src-tauri", "Cargo.toml")],
    {
      cwd: join(agentGuiRoot, "src-tauri"),
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  if (result.status !== 0) {
    throw new Error(`cargo test global_shortcut failed (exit ${result.status ?? "unknown"})`);
  }
}

const totalStarted = Date.now();
console.log("preflight-release-gate: start");

try {
  runStep("version", checkVersionNotes);
  runStep("nsis-assets", checkNsisInstallerAssets);
  runStep("tests", runReleaseGateTests);
  runStep("rust-shortcut", maybeRunRustShortcutTest);
} catch (err) {
  console.error(`preflight-release-gate: FAIL ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const totalMs = Date.now() - totalStarted;
console.log(`preflight-release-gate: PASS (${totalMs}ms total)`);
