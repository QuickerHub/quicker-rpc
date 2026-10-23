import assert from "node:assert/strict";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test, type TestContext } from "node:test";
import Database from "better-sqlite3";
import { acquireAgentDatabaseWriterLease, AgentDatabaseWriterBusyError } from "./writer-lease";

const fixtureBase = fileURLToPath(new URL("../../../../../.tmp/", import.meta.url));

function fixture(t: TestContext) {
  mkdirSync(fixtureBase, { recursive: true });
  const root = mkdtempSync(join(fixtureBase, "writer-lease-"));
  const leases: { release(): void }[] = [];
  t.after(() => {
    for (const lease of leases) lease.release();
    const suffix = relative(realpathSync(fixtureBase), realpathSync(root));
    assert.ok(suffix && suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix));
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    acquire(path = join(root, "agent.db")) {
      const lease = acquireAgentDatabaseWriterLease(path);
      leases.push(lease);
      return lease;
    },
  };
}

test("separate owners in one process contend on a real SQLite lock without creating the application DB", (t) => {
  const { root, acquire } = fixture(t);
  const path = join(root, "agent.db");
  const first = acquire();
  assert.equal(existsSync(path), false);
  assert.equal(existsSync(first.leasePath), true);
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.throws(() => acquireAgentDatabaseWriterLease(path), AgentDatabaseWriterBusyError);
  }
  first.release();
  first.release();
  assert.equal(existsSync(first.leasePath), true, "release must never unlink the sidecar");
  acquire().release();
});

test("canonical directory aliases cannot create independent leases", (t) => {
  const { root, acquire } = fixture(t);
  const directory = join(root, "canonical");
  mkdirSync(directory);
  const alias = join(root, "alias");
  symlinkSync(directory, alias, process.platform === "win32" ? "junction" : "dir");
  const path = join(directory, "agent.db");
  const first = acquire(path);
  assert.equal(first.databasePath, join(realpathSync(directory), "agent.db"));
  assert.throws(() => acquireAgentDatabaseWriterLease(join(alias, "agent.db")), AgentDatabaseWriterBusyError);
});

test("acquiring a lease does not change the existing application's database bytes or journal mode", (t) => {
  const { root, acquire } = fixture(t);
  const path = join(root, "agent.db");
  const original = new Database(path);
  original.exec("CREATE TABLE application_data(value TEXT); INSERT INTO application_data VALUES ('fixture');");
  original.close();
  const before = readFileSync(path);
  acquire();
  assert.deepEqual(readFileSync(path), before);
});

test("DB hard links and sidecar aliases are rejected instead of splitting ownership", (t) => {
  const { root, acquire } = fixture(t);
  const path = join(root, "agent.db");
  new Database(path).close();
  linkSync(path, join(root, "hardlinked.db"));
  assert.throws(() => acquire(), /hard links/);
  const otherPath = join(root, "other.db");
  const sidecar = `${otherPath}.writer.sqlite`;
  symlinkSync(path, sidecar, process.platform === "win32" ? "junction" : "file");
  assert.throws(() => acquire(otherPath), /without aliases/);
});

test("failed initialization closes its partially acquired transaction before retry", (t) => {
  const { root, acquire } = fixture(t);
  const path = join(root, "agent.db");
  let opened!: Database.Database;
  const failure = new Error("fixture initialization failed");
  assert.throws(() => acquireAgentDatabaseWriterLease(path, {
    openDatabase(file, options) {
      assert.equal(options.timeout, 0);
      opened = new Database(file, options);
      return {
        pragma: opened.pragma.bind(opened),
        exec(sql) { opened.exec(sql); if (sql.includes("BEGIN EXCLUSIVE")) throw failure; return opened; },
        close: opened.close.bind(opened),
        get inTransaction() { return opened.inTransaction; },
      };
    },
  }), (error) => error === failure);
  assert.equal(opened.open, false);
  acquire().release();
});

test("relative and in-memory database names are rejected before opening a connection", () => {
  for (const path of ["agent.db", ":memory:"]) assert.throws(() => acquireAgentDatabaseWriterLease(path), /absolute/);
});
