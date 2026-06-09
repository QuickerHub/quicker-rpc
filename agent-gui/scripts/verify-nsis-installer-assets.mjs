/**
 * Verify NSIS custom installer assets before expensive `tauri build`.
 * Catches missing kill-bundled-node.vbs / bad relative paths in <10ms.
 *
 * Usage: node scripts/verify-nsis-installer-assets.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriRoot = join(agentGuiRoot, "src-tauri");
const hooksPath = join(tauriRoot, "windows", "installer-hooks.nsh");
const vbsPath = join(tauriRoot, "windows", "kill-bundled-node.vbs");

function fail(message) {
  console.error(`verify-nsis-installer-assets: FAIL ${message}`);
  process.exit(1);
}

function resolveNsisStagedVbsPath() {
  // Tauri copies installer-hooks.nsh to target/release/nsis/x64 before makensis.
  const stagedHooksDir = join(tauriRoot, "target", "release", "nsis", "x64");
  const hooks = readFileSync(hooksPath, "utf8");
  const match = hooks.match(
    /File\s+"\/oname=\$PLUGINSDIR\\kill-bundled-node\.vbs"\s+"\$\{__FILEDIR__\}([^"]+)"/,
  );
  if (!match) {
    fail("installer-hooks.nsh missing StageKillBundledNodeVbs File directive");
  }
  // Captured path is suffix after ${__FILEDIR__} (often "\..\..\..\windows\...").
  // Leading "\" would make path.resolve treat it as drive-root absolute on Windows.
  const relative = match[1].replace(/\\/g, "/").replace(/^[/\\]+/, "");
  const resolved = resolve(stagedHooksDir, relative);
  return resolved;
}

if (!existsSync(hooksPath)) {
  fail(`missing ${hooksPath}`);
}
if (!existsSync(vbsPath)) {
  fail(`missing ${vbsPath}`);
}

const stagedResolved = resolveNsisStagedVbsPath();
if (resolve(stagedResolved) !== resolve(vbsPath)) {
  fail(
    `NSIS staged path does not resolve to kill-bundled-node.vbs\n` +
      `  staged: ${stagedResolved}\n` +
      `  expected: ${vbsPath}`,
  );
}

console.log("verify-nsis-installer-assets: PASS");
console.log(`  hooks: ${hooksPath}`);
console.log(`  vbs:   ${vbsPath}`);
