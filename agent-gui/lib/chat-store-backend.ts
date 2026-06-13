import { isActionDesignerEmbedClient } from "@/lib/action-designer-embed";

export type ChatStorePersistenceMode = "api" | "localStorage";

let persistenceMode: ChatStorePersistenceMode =
  typeof process !== "undefined"
  && process.env.CHAT_STORE_PERSISTENCE === "localStorage"
    ? "localStorage"
    : "api";

/** Production client uses SQLite via /api/chat-store; tests use localStorage. */
export function getChatStorePersistenceMode(): ChatStorePersistenceMode {
  if (typeof window === "undefined") return "localStorage";
  // Designer embed shares the QuickerAgent Next server; avoid SQLite lock with the desktop shell.
  if (isActionDesignerEmbedClient()) return "localStorage";
  return persistenceMode;
}

/** @internal test helper */
export function setChatStorePersistenceModeForTests(
  mode: ChatStorePersistenceMode,
): void {
  persistenceMode = mode;
}
