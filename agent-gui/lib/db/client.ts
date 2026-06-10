import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolvePersistedDataFilePath } from "@/lib/quicker-agent-persisted-data";
import { backupChatDatabaseBeforeFirstMigration } from "@/lib/db/backup";
import { patchLegacyChatSchema } from "@/lib/db/legacy-schema";
import { resolveMigrationsFolder } from "@/lib/db/paths";
import * as schema from "@/lib/db/schema";

export const CHAT_DB_FILENAME = "chats.db";

export type ChatDatabase = BetterSQLite3Database<typeof schema>;

let sqliteInstance: Database.Database | null = null;
let drizzleInstance: ChatDatabase | null = null;
let migrationsApplied = false;

export function resolveChatDatabasePath(): string {
  return resolvePersistedDataFilePath(CHAT_DB_FILENAME);
}

function applyMigrations(db: ChatDatabase, dbPath: string, sqlite: Database.Database): void {
  if (migrationsApplied) return;
  backupChatDatabaseBeforeFirstMigration(sqlite, dbPath);
  patchLegacyChatSchema(sqlite);
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  migrationsApplied = true;
}

function openSqliteAt(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
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
  const path = resolveChatDatabasePath();
  sqliteInstance = openSqliteAt(path);
  drizzleInstance = drizzle(sqliteInstance, { schema });
  applyMigrations(drizzleInstance, path, sqliteInstance);
  return drizzleInstance;
}
