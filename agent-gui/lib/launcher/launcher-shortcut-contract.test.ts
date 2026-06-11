import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { DEFAULT_LAUNCHER_SHORTCUT } from "./launcher-prefs.ts";
import { isValidTauriShortcut } from "./launcher-shortcut-format.ts";

const launcherDir = dirname(fileURLToPath(import.meta.url));
const agentGuiRoot = join(launcherDir, "../..");
const repoRoot = join(agentGuiRoot, "..");

function readSource(relFromAgentGui: string): string {
  return readFileSync(join(agentGuiRoot, relFromAgentGui), "utf8");
}

function readRepoDoc(relFromRepo: string): string {
  return readFileSync(join(repoRoot, relFromRepo), "utf8");
}

function extractTsDefaultShortcut(source: string): string {
  const match = source.match(
    /export const DEFAULT_LAUNCHER_SHORTCUT = "([^"]+)";/,
  );
  assert.ok(match, "launcher-prefs.ts must export DEFAULT_LAUNCHER_SHORTCUT");
  return match[1]!;
}

function extractRustDefaultShortcut(source: string): string {
  const match = source.match(
    /pub const DEFAULT_LAUNCHER_SHORTCUT: &str = "([^"]+)";/,
  );
  assert.ok(match, "global_shortcut.rs must export DEFAULT_LAUNCHER_SHORTCUT");
  return match[1]!;
}

function extractElectronDefaultShortcut(source: string): string {
  const match = source.match(
    /export const DEFAULT_LAUNCHER_SHORTCUT = "([^"]+)";/,
  );
  assert.ok(
    match,
    "electron/commands/global-shortcut.mjs must export DEFAULT_LAUNCHER_SHORTCUT",
  );
  return match[1]!;
}

test("DEFAULT_LAUNCHER_SHORTCUT stays valid for Tauri registration", () => {
  assert.equal(isValidTauriShortcut(DEFAULT_LAUNCHER_SHORTCUT), true);
});

test("TypeScript, Rust, and Electron default launcher shortcuts match", () => {
  const tsDefault = extractTsDefaultShortcut(
    readSource("lib/launcher/launcher-prefs.ts"),
  );
  const rustDefault = extractRustDefaultShortcut(
    readSource("src-tauri/src/global_shortcut.rs"),
  );
  const electronDefault = extractElectronDefaultShortcut(
    readSource("electron/commands/global-shortcut.mjs"),
  );

  assert.equal(tsDefault, rustDefault);
  assert.equal(tsDefault, electronDefault);
  assert.equal(tsDefault, DEFAULT_LAUNCHER_SHORTCUT);
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("launcher docs reference the same default shortcut", () => {
  const expected = escapeRegExp(DEFAULT_LAUNCHER_SHORTCUT);
  const launcherDoc = readRepoDoc("docs/agent-gui-launcher.md");
  const agentDoc = readRepoDoc("docs/quicker-agent.md");

  assert.match(launcherDoc, new RegExp(`\\| 唤起 \\| \`${expected}\``));
  assert.match(launcherDoc, new RegExp(`默认 ${expected}`));
  assert.match(launcherDoc, new RegExp(`默认 \`${expected}\``));
  assert.match(agentDoc, new RegExp(`\`${expected}\``));
  assert.match(agentDoc, new RegExp(`\\*\\*\`${expected}\`\\*\\*`));
});

test("launcher default is Ctrl+Shift+Space (CommandOrControl+Shift+Space wire form)", () => {
  assert.equal(DEFAULT_LAUNCHER_SHORTCUT, "CommandOrControl+Shift+Space");
});
