import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, beforeEach, mock, test } from "node:test";
import Database from "better-sqlite3";
import { AppKvKey, readAppKvJson } from "./app-kv";
import { getAgentSqlite, openChatDatabaseAt, resetChatDatabaseClientForTests } from "./client";
import { resolveMigrationsFolder } from "./paths";

let directory = "";
let legacyDirectory = "";

beforeEach(() => {
  directory = fs.mkdtempSync(join(tmpdir(), "qka-db-isolation-"));
  legacyDirectory = join(directory, "legacy");
  fs.mkdirSync(legacyDirectory);
  const fixture = new Database(join(legacyDirectory, "chats.db"));
  fixture.exec("CREATE TABLE fixture_marker (value TEXT); INSERT INTO fixture_marker VALUES ('fixture-only');");
  fixture.close();
  fs.writeFileSync(join(legacyDirectory, "llm-secrets.json"), JSON.stringify({ marker: "fixture-only" }));
});

afterEach(() => {
  resetChatDatabaseClientForTests();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Reject ambient configuration discovery before it can read or copy anything. */
function withFixtureFileAccess(run: () => void): void {
  const roots = [directory, resolveMigrationsFolder()].map((root) => resolve(root).toLowerCase());
  const assertAllowed = (path: unknown) => {
    assert.equal(typeof path, "string", "Expected an explicit fixture file path.");
    const absolute = resolve(path as string).toLowerCase();
    assert.ok(roots.some((root) => absolute === root || absolute.startsWith(`${root}${sep}`)),
      "Isolated initialization attempted to access files outside its fixture and SQL migrations.");
  };
  const exists = fs.existsSync;
  const read = fs.readFileSync;
  const copy = fs.copyFileSync;
  const spies = [
    mock.method(fs, "existsSync", (path: fs.PathLike) => {
      assertAllowed(path);
      return exists(path);
    }),
    mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => {
      assertAllowed(args[0]);
      return Reflect.apply(read, fs, args);
    }),
    mock.method(fs, "copyFileSync", (...args: Parameters<typeof fs.copyFileSync>) => {
      assertAllowed(args[0]);
      assertAllowed(args[1]);
      return Reflect.apply(copy, fs, args);
    }),
  ];
  syncBuiltinESMExports();
  try {
    run();
  } finally {
    for (const spy of spies) spy.mock.restore();
    syncBuiltinESMExports();
  }
}

test("isolated database initialization disables legacy database and configuration discovery", () => {
  withFixtureFileAccess(() => {
    openChatDatabaseAt(join(directory, "isolated.db"), { legacyImport: false });
    const marker = getAgentSqlite().prepare("SELECT name FROM sqlite_master WHERE name = 'fixture_marker'").get();
    assert.equal(marker, undefined);
    assert.equal(readAppKvJson(AppKvKey.llmSecrets), null);
    assert.ok(getAgentSqlite().prepare("SELECT name FROM sqlite_master WHERE name = 'chat_threads'").get());
    const columns = getAgentSqlite().prepare("PRAGMA table_info(chat_threads)").all() as { name: string }[];
    assert.ok(columns.some((column) => column.name === "working_directory"));
    assert.ok(columns.some((column) => column.name === "authoring_focus_json"));
  });
});

test("explicit fixture imports preserve legacy data and never discover ambient sources", () => {
  withFixtureFileAccess(() => {
    openChatDatabaseAt(join(directory, "imported.db"), { legacyImport: { directory: legacyDirectory } });
    assert.deepEqual(getAgentSqlite().prepare("SELECT value FROM fixture_marker").get(), { value: "fixture-only" });
    assert.deepEqual(readAppKvJson(AppKvKey.llmSecrets), { marker: "fixture-only" });
  });
});

test("an empty explicit legacy directory never falls back to user or install sources", () => {
  const emptyDirectory = join(directory, "empty-legacy");
  fs.mkdirSync(emptyDirectory);
  withFixtureFileAccess(() => {
    openChatDatabaseAt(join(directory, "empty.db"), { legacyImport: { directory: emptyDirectory } });
    assert.equal(readAppKvJson(AppKvKey.llmSecrets), null);
    assert.equal(getAgentSqlite().prepare("SELECT name FROM sqlite_master WHERE name = 'fixture_marker'").get(), undefined);
  });
});

test("explicit legacy import rejects relative source directories", () => {
  assert.throws(
    () => openChatDatabaseAt(join(directory, "invalid.db"), { legacyImport: { directory: ".local" } }),
    /must be absolute/,
  );
  assert.equal(fs.existsSync(join(directory, "invalid.db")), false);
});
