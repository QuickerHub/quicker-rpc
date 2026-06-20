import { NextResponse } from "next/server";
import {
  isRevealPathScope,
  revealScopedPathInFileManager,
} from "@/lib/reveal-path-in-file-manager.server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { scope?: unknown; path?: string };
    const path = body.path?.trim();
    if (!path) {
      return NextResponse.json({ ok: false, error: "Missing path" }, { status: 400 });
    }
    if (!isRevealPathScope(body.scope)) {
      return NextResponse.json(
        { ok: false, error: "Invalid or missing scope" },
        { status: 400 },
      );
    }
    const result = await revealScopedPathInFileManager(body.scope, path);
    return NextResponse.json({ ok: true, path: result.path, via: "api" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
