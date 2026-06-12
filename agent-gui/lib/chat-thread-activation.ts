import type { ChatStoreData } from "@/lib/chat-store";
import {
  applyThreadMessagesToStore,
  openThread,
  resolveThreadMessagesAsync,
  selectThread,
} from "@/lib/chat-store";
import { scheduleSaveChatStoreViaApi } from "@/lib/chat-store-api.client";
import { getChatStorePersistenceMode } from "@/lib/chat-store-backend";

type ActivateThreadOptions = {
  threadId: string;
  /** Sidebar opens a thread in the tab strip; titlebar only switches focus. */
  mode: "open" | "select";
  onStoreChange: (next: ChatStoreData) => void;
  /** Must return the latest store (e.g. getChatStoreSnapshotSync), not a stale render ref. */
  getStore: () => ChatStoreData;
};

/** Switch the active thread immediately; load messages in the background. */
export function activateThreadWithLazyHydration({
  threadId,
  mode,
  onStoreChange,
  getStore,
}: ActivateThreadOptions): void {
  const current = getStore();
  const switched =
    mode === "open" ? openThread(current, threadId) : selectThread(current, threadId);
  onStoreChange(switched);

  const thread = switched.threads.find((item) => item.id === threadId);
  if (!thread || thread.messages.length > 0) return;

  void (async () => {
    const { messages, migratedFromLocalStorage } =
      await resolveThreadMessagesAsync(threadId);
    if (messages.length === 0) return;

    const latest = getStore();
    const existing = latest.threads.find((item) => item.id === threadId);
    if (!existing || existing.messages.length > 0) return;

    const next = applyThreadMessagesToStore(latest, threadId, messages);
    if (next === latest) return;

    if (migratedFromLocalStorage && getChatStorePersistenceMode() === "api") {
      scheduleSaveChatStoreViaApi(next);
    }
    onStoreChange(next);
  })();
}
