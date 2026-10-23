import { revealScopedPathInFileManager } from "@/lib/reveal-path-in-file-manager.server";

/** Back-compat wrapper; prefer POST /api/reveal-path. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { path?: string };
    const path = body.path?.trim();
    if (!path) {
      return Response.json({ ok: false, error: "Missing path" }, { status: 400 });
    }
    const result = await revealScopedPathInFileManager("chat-exports", path);
    return Response.json({ ok: true, path: result.path, via: "api" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
