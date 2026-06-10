import {
  countPersistedMessages,
  threadHasMessages,
  type ChatStoreData,
} from "@/lib/chat-store";

export class ChatStoreSaveWouldWipeError extends Error {
  readonly code = "CHAT_STORE_SAVE_WOULD_WIPE";

  constructor(detail: string) {
    super(`Refusing chat store save that would wipe persisted messages: ${detail}`);
    this.name = "ChatStoreSaveWouldWipeError";
  }
}

/**
 * Block saves that would clear all persisted messages or drop threads that still
 * have message blobs / positive messageCount in the database.
 */
export function assertSavePreservesPersistedMessages(
  previous: ChatStoreData | null,
  next: ChatStoreData,
  options?: { dbPersistedMessageTotal?: number },
): void {
  const dbTotal = options?.dbPersistedMessageTotal ?? 0;
  const prevTotal = previous ? countPersistedMessages(previous) : dbTotal;
  const nextTotal = countPersistedMessages(next);

  if (prevTotal > 0 && nextTotal === 0) {
    throw new ChatStoreSaveWouldWipeError(
      `persisted message total ${prevTotal} → 0`,
    );
  }

  if (!previous) return;

  for (const prevThread of previous.threads) {
    if (!threadHasMessages(prevThread)) continue;
    const nextThread = next.threads.find((item) => item.id === prevThread.id);
    if (!nextThread) {
      throw new ChatStoreSaveWouldWipeError(
        `thread ${prevThread.id} would be deleted`,
      );
    }
    if (!threadHasMessages(nextThread)) {
      throw new ChatStoreSaveWouldWipeError(
        `thread ${prevThread.id} messages would be cleared`,
      );
    }
  }
}
