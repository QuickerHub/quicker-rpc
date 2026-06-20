import { NextResponse } from "next/server";
import type { ChatMode } from "@/lib/chat-mode";
import { measureStaticShellBaseline } from "@/lib/agent-harness/static-shell-baseline.server";

export const runtime = "nodejs";

type StaticShellBaselineRequest = {
  cwd?: string;
  chatMode?: ChatMode;
  enabledToolIds?: string[];
  authoringSampleUserText?: string;
};

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const report = await measureStaticShellBaseline();
  return NextResponse.json({ report });
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  let body: StaticShellBaselineRequest = {};
  try {
    body = (await req.json()) as StaticShellBaselineRequest;
  } catch {
    // empty body → defaults
  }

  const report = await measureStaticShellBaseline({
    cwd: body.cwd,
    chatMode: body.chatMode,
    enabledToolIds: body.enabledToolIds,
    authoringSampleUserText: body.authoringSampleUserText,
  });

  return NextResponse.json({ report });
}
