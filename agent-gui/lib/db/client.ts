import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { seedAppKvFromLegacyJsonFiles } from "@/lib/db/app-kv";
import { backupChatDatabaseBeforeFirstMigration } from "@/lib/db/backup";
import { runLegacyAgentDatabaseFileMigration } from "@/lib/db/legacy-agent-db-migration";
import { patchLegacyChatSchema } from "@/lib/db/legacy-schema";
import { resolveMigrationsFolder } from "@/lib/db/paths";
import { resolveQuickerAgentPersistedDataDirectory } from "@/lib/quicker-agent-persisted-data";
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

let sqliteInstance: Database.Database | null = null;
let drizzleInstance: ChatDatabase | null = null;
let migrationsApplied = false;

export function resolveAgentDatabasePath(): string {
  return join(resolveQuickerAgentPersistedDataDirectory(), AGENT_DB_FILENAME);
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
  if (migrationsApplied) return;
  backupChatDatabaseBeforeFirstMigration(sqlite, dbPath);
  patchLegacyChatSchema(sqlite);
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  // Fresh databases only acquire their base tables during the initial migration.
  patchLegacyChatSchema(sqlite);
  if (legacySources !== false) {
    seedAppKvFromLegacyJsonFiles(sqlite, legacySources?.jsonPaths);
  }
  migrationsApplied = true;
}

function openSqliteAt(path: string, legacySources?: LegacyImportSources): Database.Database {
  if (legacySources !== false) {
    runLegacyAgentDatabaseFileMigration(path, legacySources?.databasePaths);
  }
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

/** Raw SQLite handle (shared by chat repository and app_kv). */
export function getAgentSqlite(): Database.Database {
  if (!sqliteInstance) {
    getChatDatabase();
  }
  if (!sqliteInstance) {
    throw new Error("Agent database is not open");
  }
  return sqliteInstance;
}

/** @internal test helper */
export function resetChatDatabaseClientForTests(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
  }
  drizzleInstance = null;
  migrationsApplied = false;
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
  sqliteInstance = openSqliteAt(path, legacySources);
  drizzleInstance = drizzle(sqliteInstance, { schema });
  applyMigrations(drizzleInstance, path, sqliteInstance, legacySources);
  return drizzleInstance;
}

export function getChatDatabase(): ChatDatabase {
  if (drizzleInstance) return drizzleInstance;
  const path = resolveAgentDatabasePath();
  sqliteInstance = openSqliteAt(path);
  drizzleInstance = drizzle(sqliteInstance, { schema });
  applyMigrations(drizzleInstance, path, sqliteInstance);
  return drizzleInstance;
}
