import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function setWindowsDataDirs(tempRoot: string) {
  process.env.LOCALAPPDATA = join(tempRoot, "install-local");
  process.env.APPDATA = join(tempRoot, "appdata");
}

test("migrates legacy install .local into Roaming app-data", async () => {
  const prevLocal = process.env.LOCALAPPDATA;
  const prevAppData = process.env.APPDATA;
  const prevAgentRoot = process.env.AGENT_GUI_ROOT;
  const tempRoot = mkdtempSync(join(tmpdir(), "qa-persisted-"));
  setWindowsDataDirs(tempRoot);
  const appData = join(tempRoot, "appdata", "QuickerAgent");
  const legacyLocal = join(tempRoot, "install-app", ".local");

  process.env.AGENT_GUI_ROOT = join(tempRoot, "install-app");

  mkdirSync(legacyLocal, { recursive: true });
  writeFileSync(
    join(legacyLocal, "llm-secrets.json"),
    '{"version":2,"providers":{}}\n',
    "utf8",
  );

  const mod = await import("@/lib/quicker-agent-persisted-data");
  mod.resetPersistedDataMigrationForTests();

  const target = mod.resolveQuickerAgentPersistedDataDirectory();
  assert.equal(target, appData);
  assert.ok(existsSync(join(target, "llm-secrets.json")));
  assert.equal(
    readFileSync(join(target, "llm-secrets.json"), "utf8"),
    '{"version":2,"providers":{}}\n',
  );

  if (prevLocal === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = prevLocal;
  if (prevAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = prevAppData;
  if (prevAgentRoot === undefined) delete process.env.AGENT_GUI_ROOT;
  else process.env.AGENT_GUI_ROOT = prevAgentRoot;
  mod.resetPersistedDataMigrationForTests();
  rmSync(tempRoot, { recursive: true, force: true });
});

test("merges missing legacy files without overwriting existing app-data", async () => {
  const prevLocal = process.env.LOCALAPPDATA;
  const prevAppData = process.env.APPDATA;
  const prevAgentRoot = process.env.AGENT_GUI_ROOT;
  const tempRoot = mkdtempSync(join(tmpdir(), "qa-persisted-merge-"));
  setWindowsDataDirs(tempRoot);
  const appData = join(tempRoot, "appdata", "QuickerAgent");
  const legacyLocal = join(tempRoot, "install-app", ".local");

  process.env.AGENT_GUI_ROOT = join(tempRoot, "install-app");

  mkdirSync(appData, { recursive: true });
  writeFileSync(join(appData, "device-fingerprint.json"), '{"version":1,"deviceId":"new"}\n', "utf8");

  mkdirSync(legacyLocal, { recursive: true });
  writeFileSync(join(legacyLocal, "llm-secrets.json"), '{"version":2}\n', "utf8");
  mkdirSync(join(legacyLocal, "llm-usage", "users"), { recursive: true });
  writeFileSync(join(legacyLocal, "llm-usage", "users", "u1.json"), '{"version":1}\n', "utf8");

  const mod = await import("@/lib/quicker-agent-persisted-data");
  mod.resetPersistedDataMigrationForTests();
  mod.resolveQuickerAgentPersistedDataDirectory();

  assert.equal(readFileSync(join(appData, "device-fingerprint.json"), "utf8"), '{"version":1,"deviceId":"new"}\n');
  assert.ok(existsSync(join(appData, "llm-secrets.json")));
  assert.ok(existsSync(join(appData, "llm-usage", "users", "u1.json")));

  if (prevLocal === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = prevLocal;
  if (prevAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = prevAppData;
  if (prevAgentRoot === undefined) delete process.env.AGENT_GUI_ROOT;
  else process.env.AGENT_GUI_ROOT = prevAgentRoot;
  mod.resetPersistedDataMigrationForTests();
  rmSync(tempRoot, { recursive: true, force: true });
});

test("migrates user data from colocated install tree to Roaming app-data", async () => {
  const prevLocal = process.env.LOCALAPPDATA;
  const prevAppData = process.env.APPDATA;
  const tempRoot = mkdtempSync(join(tmpdir(), "qa-persisted-install-"));
  setWindowsDataDirs(tempRoot);
  const installRoot = join(tempRoot, "install-local", "QuickerAgent");
  const appData = join(tempRoot, "appdata", "QuickerAgent");

  mkdirSync(join(installRoot, "local"), { recursive: true });
  writeFileSync(join(installRoot, "local", "chats.db"), "legacy-db", "utf8");
  mkdirSync(join(installRoot, "plugins", "voice-asr"), { recursive: true });
  writeFileSync(join(installRoot, "plugins", "voice-asr", "manifest.json"), "{}", "utf8");

  const mod = await import("@/lib/quicker-agent-persisted-data");
  mod.resetPersistedDataMigrationForTests();
  mod.resolveQuickerAgentPersistedDataDirectory();

  assert.ok(existsSync(join(appData, "local", "chats.db")));
  assert.ok(existsSync(join(appData, "plugins", "voice-asr", "manifest.json")));

  if (prevLocal === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = prevLocal;
  if (prevAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = prevAppData;
  mod.resetPersistedDataMigrationForTests();
  rmSync(tempRoot, { recursive: true, force: true });
});
