import { copyFileSync, existsSync } from "node:fs";

const WAL_SUFFIXES = ["-wal", "-shm"] as const;

function copySqliteSidecars(sourcePath: string, destPath: string): void {
  for (const suffix of WAL_SUFFIXES) {
    const src = `${sourcePath}${suffix}`;
    if (existsSync(src)) {
      copyFileSync(src, `${destPath}${suffix}`);
    }
  }
}

/**
 * Snapshot chats.db before the first Drizzle migration on a legacy database.
 * Skips when backup already exists or the file is new/empty.
 */
export function backupChatDatabaseBeforeFirstMigration(
  sqlite: { prepare: (sql: string) => { get: () => unknown } },
  dbPath: string,
): void {
  const hasDrizzleMeta = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get();
  if (hasDrizzleMeta) return;

  const threadsTable = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chat_threads'",
    )
    .get();
  if (!threadsTable) return;

  const threadRow = sqlite
    .prepare("SELECT COUNT(*) AS c FROM chat_threads")
    .get() as { c?: number } | undefined;
  if (!threadRow?.c) return;

  const backupPath = `${dbPath}.pre-drizzle.bak`;
  if (existsSync(backupPath)) return;

  copyFileSync(dbPath, backupPath);
  copySqliteSidecars(dbPath, backupPath);
}
