import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Singleton row (id = 1) holding chat store index metadata. */
export const chatMeta = sqliteTable("chat_meta", {
  id: integer("id").primaryKey(),
  version: integer("version").notNull(),
  activeThreadId: text("active_thread_id").notNull(),
  openTabIdsJson: text("open_tab_ids_json").notNull(),
  tabStripPersisted: integer("tab_strip_persisted"),
  workingDirectory: text("working_directory").notNull().default(""),
  activeWorkspaceId: text("active_workspace_id").notNull().default(""),
  workspacesJson: text("workspaces_json").notNull().default("[]"),
});

export const chatThreads = sqliteTable("chat_threads", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  updatedAt: integer("updated_at").notNull(),
  titleGenerated: integer("title_generated").notNull().default(0),
  titleManual: integer("title_manual").notNull().default(0),
  messageCount: integer("message_count"),
  sortIndex: integer("sort_index").notNull().default(0),
  workspaceId: text("workspace_id"),
});

export const chatThreadMessages = sqliteTable("chat_thread_messages", {
  threadId: text("thread_id")
    .primaryKey()
    .references(() => chatThreads.id, { onDelete: "cascade" }),
  messagesJson: text("messages_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const chatThreadMessagesBackup = sqliteTable("chat_thread_messages_backup", {
  threadId: text("thread_id").primaryKey(),
  messagesJson: text("messages_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type ChatMetaRow = typeof chatMeta.$inferSelect;
export type ChatThreadRow = typeof chatThreads.$inferSelect;
export type ChatThreadMessageRow = typeof chatThreadMessages.$inferSelect;

export const CHAT_META_SINGLETON_ID = 1;

/** JSON settings migrated from legacy *.json files under app data. */
export const appKv = sqliteTable("app_kv", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type AppKvRow = typeof appKv.$inferSelect;
