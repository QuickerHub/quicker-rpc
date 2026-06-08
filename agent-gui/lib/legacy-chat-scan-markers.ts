/** LevelDB / localStorage markers for legacy chat restore (longest prefixes first). */
export const LEGACY_CHAT_LEVELDB_MARKERS = [
  "agent-gui-chats-backup-thread-",
  "agent-gui-chats-thread-",
  "agent-gui-chats-backup",
  "agent-gui-chats",
  "agent-gui-workspaces",
] as const;

export const LEGACY_WORKSPACE_STORAGE_KEY = "agent-gui-workspaces";
