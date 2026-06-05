import { getShellSession } from "@/lib/shell-session-registry.server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return Response.json({ error: "sessionId is required" }, { status: 400 });
  }

  const snapshot = getShellSession(sessionId);
  if (!snapshot) {
    return Response.json({ ok: false, error: "session not found" }, { status: 404 });
  }

  return Response.json({ ok: true, snapshot });
}
