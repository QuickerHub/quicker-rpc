import { lstatSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import Database from "better-sqlite3";

export interface AgentDatabaseWriterLease {
  readonly databasePath: string;
  readonly leasePath: string;
  release(): void;
}

export class AgentDatabaseWriterBusyError extends Error {
  readonly code = "AGENT_DATABASE_WRITER_BUSY";
  constructor(readonly databasePath: string, options: ErrorOptions) {
    super(`Another Agent writer already owns ${databasePath}. Stop that service before opening this database.`, options);
    this.name = "AgentDatabaseWriterBusyError";
  }
}

type LeaseConnection = Pick<Database.Database, "exec" | "pragma" | "close" | "inTransaction">;
type WriterLeaseOptions = {
  /** Initialization-failure seam; production always uses the installed SQLite driver. */
  openDatabase?: (path: string, options: { timeout: number }) => LeaseConnection;
};

function canonicalDatabasePath(path: string): string {
  if (!isAbsolute(path)) throw new Error("An Agent writer lease requires an absolute database path");
  const requested = resolve(path);
  mkdirSync(dirname(requested), { recursive: true });
  const candidate = join(realpathSync(dirname(requested)), basename(requested));
  const entry = lstatSync(candidate, { throwIfNoEntry: false });
  const canonical = entry ? realpathSync(candidate) : candidate;
  const stats = entry ? statSync(canonical) : undefined;
  if (stats && (!stats.isFile() || stats.nlink > 1)) {
    throw new Error("Agent database paths must be regular files without hard links");
  }
  return canonical;
}

/**
 * The sidecar stays on disk. Never unlink it to reclaim a lease: SQLite/OS locks,
 * not file existence or a stored PID, determine ownership and survive crash recovery.
 */
export function acquireAgentDatabaseWriterLease(
  path: string,
  { openDatabase = (file, options) => new Database(file, options) }: WriterLeaseOptions = {},
): AgentDatabaseWriterLease {
  const databasePath = canonicalDatabasePath(path);
  const leasePath = `${databasePath}.writer.sqlite`;
  const entry = lstatSync(leasePath, { throwIfNoEntry: false });
  if (entry && (!entry.isFile() || entry.nlink > 1)) {
    throw new Error("Agent writer lease sidecars must be regular files without aliases");
  }
  let connection: LeaseConnection | undefined;
  try {
    connection = openDatabase(leasePath, { timeout: 0 });
    // WAL makes EXCLUSIVE equivalent to IMMEDIATE. The dedicated sidecar uses rollback locking.
    const mode = connection.pragma("journal_mode = DELETE", { simple: true });
    if (mode !== "delete") throw new Error("Agent writer lease requires SQLite DELETE journal mode");
    // Persist a real main-file schema before acquiring, then access it inside the held transaction.
    connection.exec("CREATE TABLE IF NOT EXISTS agent_writer_lease (id INTEGER PRIMARY KEY CHECK (id = 1))");
    connection.exec("BEGIN EXCLUSIVE; SELECT name FROM sqlite_schema LIMIT 1;");
    if (!connection.inTransaction) throw new Error("Agent writer lease transaction was not acquired");
  } catch (error) {
    try { connection?.close(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Agent writer lease initialization and cleanup failed"); }
    const code = (error as { code?: string } | null)?.code;
    if (code?.startsWith("SQLITE_BUSY") || code?.startsWith("SQLITE_LOCKED")) {
      throw new AgentDatabaseWriterBusyError(databasePath, { cause: error });
    }
    throw error;
  }
  const owned = connection;
  let released = false;
  return {
    databasePath,
    leasePath,
    release() {
      if (released) return;
      // Closing rolls back the outstanding transaction and releases its OS lock.
      owned.close();
      released = true;
    },
  };
}
