import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("migrates legacy install .local into QuickerAgent app-data local", async () => {
  const prevLocal = process.env.LOCALAPPDATA;
  const prevAgentRoot = process.env.AGENT_GUI_ROOT;
  const tempRoot = mkdtempSync(join(tmpdir(), "qa-persisted-"));
  const appData = join(tempRoot, "QuickerAgent");
  const legacyLocal = join(tempRoot, "install-app", ".local");

  process.env.LOCALAPPDATA = tempRoot;
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
  assert.equal(target, join(appData, "local"));
  assert.ok(existsSync(join(target, "llm-secrets.json")));
  assert.equal(
    readFileSync(join(target, "llm-secrets.json"), "utf8"),
    '{"version":2,"providers":{}}\n',
  );

  if (prevLocal === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = prevLocal;
  if (prevAgentRoot === undefined) delete process.env.AGENT_GUI_ROOT;
  else process.env.AGENT_GUI_ROOT = prevAgentRoot;
  mod.resetPersistedDataMigrationForTests();
  rmSync(tempRoot, { recursive: true, force: true });
});

test("merges missing legacy files without overwriting existing app-data local", async () => {
  const prevLocal = process.env.LOCALAPPDATA;
  const prevAgentRoot = process.env.AGENT_GUI_ROOT;
  const tempRoot = mkdtempSync(join(tmpdir(), "qa-persisted-merge-"));
  const appDataLocal = join(tempRoot, "QuickerAgent", "local");
  const legacyLocal = join(tempRoot, "install-app", ".local");

  process.env.LOCALAPPDATA = tempRoot;
  process.env.AGENT_GUI_ROOT = join(tempRoot, "install-app");

  mkdirSync(appDataLocal, { recursive: true });
  writeFileSync(join(appDataLocal, "device-fingerprint.json"), '{"version":1,"deviceId":"new"}\n', "utf8");

  mkdirSync(legacyLocal, { recursive: true });
  writeFileSync(join(legacyLocal, "llm-secrets.json"), '{"version":2}\n', "utf8");
  mkdirSync(join(legacyLocal, "llm-usage", "users"), { recursive: true });
  writeFileSync(join(legacyLocal, "llm-usage", "users", "u1.json"), '{"version":1}\n', "utf8");

  const mod = await import("@/lib/quicker-agent-persisted-data");
  mod.resetPersistedDataMigrationForTests();
  mod.resolveQuickerAgentPersistedDataDirectory();

  assert.equal(readFileSync(join(appDataLocal, "device-fingerprint.json"), "utf8"), '{"version":1,"deviceId":"new"}\n');
  assert.ok(existsSync(join(appDataLocal, "llm-secrets.json")));
  assert.ok(existsSync(join(appDataLocal, "llm-usage", "users", "u1.json")));

  if (prevLocal === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = prevLocal;
  if (prevAgentRoot === undefined) delete process.env.AGENT_GUI_ROOT;
  else process.env.AGENT_GUI_ROOT = prevAgentRoot;
  mod.resetPersistedDataMigrationForTests();
  rmSync(tempRoot, { recursive: true, force: true });
});
