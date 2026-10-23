import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { test, type TestContext } from "node:test";
import Database from "better-sqlite3";
import { AppKvKey, readAppKvJson } from "./db/app-kv";
import { closeAgentDatabase, getAgentSqlite, getChatDatabase } from "./db/client";
import { acquireAgentDatabaseWriterLease, AgentDatabaseWriterBusyError } from "./db/writer-lease";
import { resolveQuickerAgentAppDataDirectory, resolveQuickerAgentInstallDirectory } from "./quicker-agent-paths";
import { resetPersistedDataMigrationForTests, resolveQuickerAgentPersistedDataDirectory } from "./quicker-agent-persisted-data";

function fixture(t: TestContext) {
  const base = resolve("..", "..", "..", ".tmp");
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, "agent-persisted-"));
  const values = {
    APPDATA: join(root, "roaming"), LOCALAPPDATA: join(root, "install-local"),
    HOME: join(root, "home"), USERPROFILE: join(root, "home"), XDG_DATA_HOME: join(root, "xdg"),
    AGENT_GUI_ROOT: join(root, "install-app"), QUICKER_AGENT_DATA_DIR: "", OneDrive: "",
  };
  const previous = Object.keys(values).map((name) => [name, process.env[name]] as const);
  Object.assign(process.env, values);
  resetPersistedDataMigrationForTests();
  t.after(() => {
    closeAgentDatabase();
    resetPersistedDataMigrationForTests();
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    const suffix = relative(realpathSync(base), realpathSync(root));
    assert.ok(suffix && suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix));
    rmSync(root, { recursive: true, force: true });
  });
  return {
    appData: resolveQuickerAgentAppDataDirectory(),
    install: resolveQuickerAgentInstallDirectory(),
    legacy: join(values.AGENT_GUI_ROOT, ".local"),
    write(path: string, content = "fixture-only") {
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeFileSync(path, content);
    },
  };
}

test("settings migration skips application DBs and lease sidecars at every copied depth", (t) => {
  const { appData, legacy, write } = fixture(t);
  write(join(legacy, "llm-secrets.json"), '{"fixture":true}');
  const databaseFiles = ["agent.db", "chats.db", "agent.db-wal", "chats.db-shm", "agent.db-journal", "agent.db.writer.sqlite", "agent.db.writer.sqlite-journal"];
  for (const name of databaseFiles) {
    write(join(legacy, name));
    write(join(legacy, "nested", name));
  }
  write(join(legacy, "nested", "settings.json"), "{}");
  assert.equal(resolveQuickerAgentPersistedDataDirectory(), appData);
  assert.equal(readFileSync(join(appData, "llm-secrets.json"), "utf8"), '{"fixture":true}');
  assert.equal(readFileSync(join(appData, "nested", "settings.json"), "utf8"), "{}");
  for (const name of databaseFiles) {
    assert.equal(existsSync(join(appData, name)), false);
    assert.equal(existsSync(join(appData, "nested", name)), false);
  }
});

test("settings migration merges missing files without replacing existing profile values", (t) => {
  const { appData, legacy, write } = fixture(t);
  write(join(appData, "device-fingerprint.json"), '{"fixture":"current"}');
  write(join(legacy, "device-fingerprint.json"), '{"fixture":"old"}');
  write(join(legacy, "llm-usage", "users", "u1.json"), "{}");
  resolveQuickerAgentPersistedDataDirectory();
  assert.equal(readFileSync(join(appData, "device-fingerprint.json"), "utf8"), '{"fixture":"current"}');
  assert.ok(existsSync(join(appData, "llm-usage", "users", "u1.json")));
});

test("colocated install agent definitions migrate while its databases remain for the leased importer", (t) => {
  const { appData, install, write } = fixture(t);
  write(join(install, "local", "chats.db"));
  write(join(install, "agent-defs", "example-agent", "manifest.json"), "{}");
  resolveQuickerAgentPersistedDataDirectory();
  assert.equal(existsSync(join(appData, "local", "chats.db")), false);
  assert.ok(existsSync(join(appData, "agent-defs", "example-agent", "manifest.json")));
});

test("default client acquires its lease before settings migration or legacy database import", (t) => {
  const { appData, legacy, install, write } = fixture(t);
  write(join(legacy, "llm-secrets.json"), '{"fixture":"legacy"}');
  const source = new Database(join(legacy, "agent.db"));
  source.exec("CREATE TABLE fixture_marker(value TEXT); INSERT INTO fixture_marker VALUES ('legacy fixture');");
  source.close();
  mkdirSync(join(install, "local"), { recursive: true });
  const older = new Database(join(install, "local", "chats.db"));
  older.exec("CREATE TABLE fixture_marker(value TEXT); INSERT INTO fixture_marker VALUES ('older chats fixture');");
  older.close();
  const path = join(appData, "agent.db");
  const lease = acquireAgentDatabaseWriterLease(path);
  try {
    assert.throws(() => getChatDatabase(), AgentDatabaseWriterBusyError);
    assert.equal(existsSync(path), false);
    assert.equal(existsSync(join(appData, "llm-secrets.json")), false);
  } finally {
    lease.release();
  }
  getChatDatabase();
  assert.deepEqual(getAgentSqlite().prepare("SELECT value FROM fixture_marker").get(), { value: "legacy fixture" });
  assert.deepEqual(readAppKvJson(AppKvKey.llmSecrets), { fixture: "legacy" });
});
