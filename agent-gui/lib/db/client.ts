import { isAbsolute, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { seedAppKvFromLegacyJsonFiles } from "@/lib/db/app-kv";
import { backupChatDatabaseBeforeFirstMigration } from "@/lib/db/backup";
import { runLegacyAgentDatabaseFileMigration } from "@/lib/db/legacy-agent-db-migration";
import { patchLegacyChatSchema } from "@/lib/db/legacy-schema";
import { resolveMigrationsFolder } from "@/lib/db/paths";
import { acquireAgentDatabaseWriterLease, type AgentDatabaseWriterLease } from "@/lib/db/writer-lease";
import { resolveQuickerAgentAppDataDirectory } from "@/lib/quicker-agent-paths";
import { resolveQuickerAgentPersistedDataDirectory } from "@/lib/quicker-agent-persisted-data";
import { configureAgentDataProfile } from "@/lib/agent-data-profile.mjs";
import * as schema from "@/lib/db/schema";

export const AGENT_DB_FILENAME = "agent.db";

/** @deprecated Use AGENT_DB_FILENAME */
export const CHAT_DB_FILENAME = AGENT_DB_FILENAME;

export type ChatDatabase = BetterSQLite3Database<typeof schema>;

export type ChatDatabaseOpenOptions = {
  /** Explicit database opens never discover user or install data implicitly. */
  legacyImport: false | { directory: string };
};

type LegacyImportSources = false | {
  databasePaths: readonly string[];
  jsonPaths: (filename: string) => readonly string[];
};

type DatabaseOwner = {
  readonly lease: AgentDatabaseWriterLease;
  status: "opening" | "ready" | "failed";
  sqlite?: Database.Database;
  database?: ChatDatabase;
  error?: unknown;
};

// Next HMR can reload this module. The process still has one connection and lease owner.
const ownerKey = Symbol.for("quicker-agent.database-owner.v1");
const processState = globalThis as typeof globalThis & { [ownerKey]?: DatabaseOwner };

export function resolveAgentDatabasePath(): string {
  // Path discovery must not copy legacy files before the writer lease is acquired.
  return join(resolveQuickerAgentAppDataDirectory(), AGENT_DB_FILENAME);
}

/** @deprecated Use resolveAgentDatabasePath */
export function resolveChatDatabasePath(): string {
  return resolveAgentDatabasePath();
}

function applyMigrations(
  db: ChatDatabase,
  dbPath: string,
  sqlite: Database.Database,
  legacySources?: LegacyImportSources,
): void {
  backupChatDatabaseBeforeFirstMigration(sqlite, dbPath);
  patchLegacyChatSchema(sqlite);
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  // Fresh databases only acquire their base tables during the initial migration.
  patchLegacyChatSchema(sqlite);
  if (legacySources !== false) {
    seedAppKvFromLegacyJsonFiles(sqlite, legacySources?.jsonPaths);
  }
}

function openOwnedDatabase(
  path: string,
  legacySources?: LegacyImportSources,
  prepareDirectory?: () => void,
): ChatDatabase {
  const lease = acquireAgentDatabaseWriterLease(path);
  const owner: DatabaseOwner = { lease, status: "opening" };
  processState[ownerKey] = owner;
  try {
    prepareDirectory?.();
    if (legacySources !== false) {
      runLegacyAgentDatabaseFileMigration(lease.databasePath, legacySources?.databasePaths);
    }
    const sqlite = new Database(lease.databasePath);
    owner.sqlite = sqlite;
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite, { schema });
    applyMigrations(database, lease.databasePath, sqlite, legacySources);
    owner.database = database;
    owner.status = "ready";
    return database;
  } catch (error) {
    owner.status = "failed";
    owner.error = error;
    try {
      closeAgentDatabase();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Agent database initialization and cleanup failed");
    }
    throw error;
  }
}

function requireReadyOwner(): DatabaseOwner & { sqlite: Database.Database; database: ChatDatabase } {
  const owner = processState[ownerKey];
  if (owner?.status !== "ready" || !owner.sqlite || !owner.database) {
    throw new Error("Agent database is not ready", { cause: owner?.error });
  }
  return owner as DatabaseOwner & { sqlite: Database.Database; database: ChatDatabase };
}

/** Raw SQLite handle (shared by chat repository and app_kv). */
export function getAgentSqlite(): Database.Database {
  getChatDatabase();
  return requireReadyOwner().sqlite;
}

/** Close this process's lazy database handle without opening a new connection. */
export function closeAgentDatabase(): void {
  const owner = processState[ownerKey];
  if (!owner) return;
  // If closing fails, keep the lease and owner so a second writer cannot take over.
  if (owner.sqlite?.open) owner.sqlite.close();
  owner.status = "failed";
  owner.database = undefined;
  owner.lease.release();
  delete processState[ownerKey];
}

/** @internal test helper */
export function resetChatDatabaseClientForTests(): void {
  closeAgentDatabase();
}

/** @internal Explicit test/fixture initialization; production uses getChatDatabase. */
export function openChatDatabaseAt(path: string, options: ChatDatabaseOpenOptions): ChatDatabase {
  let legacySources: LegacyImportSources = false;
  if (options.legacyImport !== false) {
    const directory = options.legacyImport.directory;
    if (!isAbsolute(directory)) {
      throw new Error("An explicit legacy import directory must be absolute.");
    }
    legacySources = {
      databasePaths: [join(directory, "chats.db"), join(directory, AGENT_DB_FILENAME)],
      jsonPaths: (filename) => [join(directory, filename)],
    };
  }
  resetChatDatabaseClientForTests();
  return openOwnedDatabase(path, legacySources);
}

export function getChatDatabase(): ChatDatabase {
  if (processState[ownerKey]) return requireReadyOwner().database;
  configureAgentDataProfile();
  const path = resolveAgentDatabasePath();
  return openOwnedDatabase(path, undefined, () => {
    resolveQuickerAgentPersistedDataDirectory();
  });
}
