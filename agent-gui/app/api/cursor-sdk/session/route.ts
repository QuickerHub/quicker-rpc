import { cursorSdkDevOnlyResponse } from "@/lib/cursor-sdk/dev-guard.server";
import { fetchCursorSdkRuntimeJson } from "@/lib/cursor-sdk-runtime-client.server";

export async function DELETE(req: Request) {
  const blocked = cursorSdkDevOnlyResponse();
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
  };
  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return Response.json({ error: "sessionId is required" }, { status: 400 });
  }

  try {
    const result = await fetchCursorSdkRuntimeJson<{ disposed?: boolean }>(
      "/v1/session",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      },
    );
    return Response.json({ ok: true, disposed: result.disposed === true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
