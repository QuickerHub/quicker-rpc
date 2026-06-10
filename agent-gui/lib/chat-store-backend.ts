export type ChatStorePersistenceMode = "api" | "localStorage";

let persistenceMode: ChatStorePersistenceMode =
  typeof process !== "undefined"
  && process.env.CHAT_STORE_PERSISTENCE === "localStorage"
    ? "localStorage"
    : "api";

/** Production client uses SQLite via /api/chat-store; tests use localStorage. */
export function getChatStorePersistenceMode(): ChatStorePersistenceMode {
  if (typeof window === "undefined") return "localStorage";
  return persistenceMode;
}

/** @internal test helper */
export function setChatStorePersistenceModeForTests(
  mode: ChatStorePersistenceMode,
): void {
  persistenceMode = mode;
}
