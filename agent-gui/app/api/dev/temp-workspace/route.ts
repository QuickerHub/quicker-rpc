import { NextResponse } from "next/server";
import { isAgentGuiDebugMode } from "@/lib/agent-gui-debug";
import {
  cleanupDevTempWorkspace,
  createDevTempWorkspace,
} from "@/lib/dev-temp-workspace.server";
import type { DevTempWorkspaceSeed } from "@/lib/dev-temp-workspace.shared";

export const runtime = "nodejs";

function devOnly() {
  if (!isAgentGuiDebugMode()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  return null;
}

export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  let body: { seed?: DevTempWorkspaceSeed } = {};
  try {
    body = (await req.json()) as { seed?: DevTempWorkspaceSeed };
  } catch {
    /* empty body ok */
  }

  const seed = body.seed === "empty" ? "empty" : "eval-workspace";

  try {
    const created = await createDevTempWorkspace({ seed });
    return NextResponse.json(created);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  let body: { path?: string };
  try {
    body = (await req.json()) as { path?: string };
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const path = body.path?.trim() ?? "";
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  try {
    const cleanup = await cleanupDevTempWorkspace(path);
    return NextResponse.json({ ok: true, ...cleanup });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
