import type Database from "better-sqlite3";

function tableHasColumn(
  sqlite: Database.Database,
  table: string,
  column: string,
): boolean {
  const rows = sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function addColumnIfMissing(
  sqlite: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  if (tableHasColumn(sqlite, table, column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * One-time upgrades for databases created before Drizzle / workspace columns.
 * Kept separate from Drizzle migrations because SQLite cannot ADD COLUMN IF NOT EXISTS.
 */
export function patchLegacyChatSchema(sqlite: Database.Database): void {
  const table = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chat_meta'",
    )
    .get();
  if (!table) return;

  addColumnIfMissing(sqlite, "chat_meta", "active_workspace_id", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, "chat_meta", "workspaces_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(sqlite, "chat_threads", "workspace_id", "TEXT");
  addColumnIfMissing(sqlite, "chat_threads", "working_directory", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, "chat_threads", "action_designer_entity_id", "TEXT");
  addColumnIfMissing(sqlite, "chat_threads", "action_designer_is_sub_program", "INTEGER");
  addColumnIfMissing(sqlite, "chat_threads", "authoring_focus_json", "TEXT");
}
