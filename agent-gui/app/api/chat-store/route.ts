import type { ChatStoreData } from "@/lib/chat-store";
import { normalizeLoadedStore } from "@/lib/chat-store";
import { ChatStoreSaveWouldWipeError } from "@/lib/db/save-guard";
import {
  chatDatabaseHasPersistedMessages,
  chatDatabaseHasThreads,
  loadChatStoreFromDatabase,
  saveChatStoreToDatabase,
} from "@/lib/chat-store-db.server";
import type { ChatLoadMessageScope } from "@/lib/chat-store-persist";

export const dynamic = "force-dynamic";

function parseMessageScope(raw: string | null): ChatLoadMessageScope {
  if (raw === "all" || raw === "none") return raw;
  return "active";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const messageScope = parseMessageScope(url.searchParams.get("scope"));
  try {
    const store = loadChatStoreFromDatabase({ messageScope });
    const hasThreads = chatDatabaseHasThreads();
    const hasMessages = chatDatabaseHasPersistedMessages();
    // DB has rows but load failed (schema/version) — never report "empty" (would trigger wipe).
    if (!store && hasThreads) {
      return Response.json(
        { ok: false, error: "chat_store_load_failed", hasThreads, hasMessages },
        { status: 500 },
      );
    }
    return Response.json({
      ok: true,
      empty: !store || !hasMessages,
      store: store ? normalizeLoadedStore(store) : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const data = body as Partial<ChatStoreData> & {
    previous?: ChatStoreData | null;
  };
  if (typeof data !== "object" || data === null || !Array.isArray(data.threads)) {
    return Response.json({ ok: false, error: "invalid_store" }, { status: 400 });
  }

  try {
    saveChatStoreToDatabase(data as ChatStoreData, {
      previous: data.previous ?? null,
    });
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof ChatStoreSaveWouldWipeError ? 409 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
