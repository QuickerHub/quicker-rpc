import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
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

function applyMigrations(db: ChatDatabase, dbPath: string, sqlite: Database.Database): void {
  if (migrationsApplied) return;
  backupChatDatabaseBeforeFirstMigration(sqlite, dbPath);
  patchLegacyChatSchema(sqlite);
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  seedAppKvFromLegacyJsonFiles(sqlite);
  migrationsApplied = true;
}

function openSqliteAt(path: string): Database.Database {
  runLegacyAgentDatabaseFileMigration(path);
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

/** @internal test helper */
export function openChatDatabaseAt(path: string): ChatDatabase {
  resetChatDatabaseClientForTests();
  sqliteInstance = openSqliteAt(path);
  drizzleInstance = drizzle(sqliteInstance, { schema });
  applyMigrations(drizzleInstance, path, sqliteInstance);
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
