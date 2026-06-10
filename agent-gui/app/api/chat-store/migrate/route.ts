import type { ChatStoreData } from "@/lib/chat-store";
import { normalizeLoadedStore } from "@/lib/chat-store";
import {
  chatDatabaseHasPersistedMessages,
  importChatStoreToDatabase,
  loadChatStoreFromDatabase,
  mergeImportedChatStoreIntoDatabase,
} from "@/lib/chat-store-db.server";

export const dynamic = "force-dynamic";

/** Import a full chat store (e.g. from WebView localStorage) into SQLite. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const incoming = body as Partial<ChatStoreData> & { merge?: boolean };
  if (typeof incoming !== "object" || incoming === null || !Array.isArray(incoming.threads)) {
    return Response.json({ ok: false, error: "invalid_store" }, { status: 400 });
  }

  const store = normalizeLoadedStore(incoming as ChatStoreData);
  const hasIncomingMessages = store.threads.some((t) => t.messages.length > 0);

  if (!hasIncomingMessages) {
    return Response.json({ ok: false, error: "empty_store" }, { status: 400 });
  }

  if (incoming.merge === true) {
    const messagesWritten = mergeImportedChatStoreIntoDatabase(store);
    const loaded = loadChatStoreFromDatabase({ messageScope: "all" });
    return Response.json({
      ok: true,
      merged: true,
      skipped: false,
      messagesWritten,
      store: loaded ? normalizeLoadedStore(loaded) : store,
    });
  }

  if (chatDatabaseHasPersistedMessages()) {
    const existing = loadChatStoreFromDatabase({ messageScope: "all" });
    if (existing) {
      return Response.json({
        ok: true,
        merged: false,
        skipped: true,
        store: normalizeLoadedStore(existing),
      });
    }
  }

  importChatStoreToDatabase(store, { allowWipe: true });
  const loaded = loadChatStoreFromDatabase({ messageScope: "active" });
  return Response.json({
    ok: true,
    merged: false,
    skipped: false,
    store: loaded ? normalizeLoadedStore(loaded) : store,
  });
}
