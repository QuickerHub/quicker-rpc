import { loadThreadMessagesFromDatabase } from "@/lib/chat-store-db.server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await context.params;
  if (!threadId?.trim()) {
    return Response.json({ ok: false, error: "missing_thread_id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const preferBackup = url.searchParams.get("preferBackup") === "1";
  const messages = loadThreadMessagesFromDatabase(threadId, { preferBackup });

  return Response.json({ ok: true, threadId, messages });
}
