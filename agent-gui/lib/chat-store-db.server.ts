import "server-only";

import {
  resetChatDatabaseClientForTests,
  CHAT_DB_FILENAME,
  resolveChatDatabasePath,
  openChatDatabaseAt,
} from "@/lib/db/client";
import {
  chatDatabaseHasPersistedMessages,
  chatDatabaseHasThreads,
  getLastDatabasePersistedSnapshot,
  importChatStoreToDatabase,
  loadChatStoreFromDatabase,
  loadThreadMessagesFromDatabase,
  mergeImportedChatStoreIntoDatabase,
  resetDatabasePersistedSnapshotForTests,
  saveChatStoreToDatabase,
} from "@/lib/db/chat-store.repository";

export {
  CHAT_DB_FILENAME,
  resolveChatDatabasePath,
  openChatDatabaseAt,
  chatDatabaseHasPersistedMessages,
  chatDatabaseHasThreads,
  getLastDatabasePersistedSnapshot,
  importChatStoreToDatabase,
  loadChatStoreFromDatabase,
  loadThreadMessagesFromDatabase,
  mergeImportedChatStoreIntoDatabase,
  resetDatabasePersistedSnapshotForTests,
  saveChatStoreToDatabase,
};

/** @internal test helper */
export function resetChatDatabaseForTests(): void {
  resetChatDatabaseClientForTests();
  resetDatabasePersistedSnapshotForTests();
}
