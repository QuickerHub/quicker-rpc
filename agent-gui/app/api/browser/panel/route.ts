import { NextResponse } from "next/server";
import { z } from "zod";
import {
  executeBrowserTool,
  type BrowserAgentToolInput,
  type BrowserPanelToolInput,
  type BrowserToolInput,
} from "@/lib/browser-tool.server";

export const runtime = "nodejs";

const bodySchema = z.object({
  action: z.enum(["navigate", "back", "forward", "reload", "click_xy", "pick_element", "screenshot"]),
  sessionId: z.string().optional(),
  url: z.string().optional(),
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
});

function mapPanelAction(input: z.infer<typeof bodySchema>): BrowserToolInput | null {
  const sessionId = input.sessionId?.trim() || "default";
  switch (input.action) {
    case "navigate":
      if (!input.url?.trim()) return null;
      return { action: "navigate", sessionId, url: input.url.trim() } satisfies BrowserAgentToolInput;
    case "back":
      return { action: "back", sessionId } satisfies BrowserAgentToolInput;
    case "forward":
      return { action: "forward", sessionId } satisfies BrowserAgentToolInput;
    case "reload":
      return { action: "reload", sessionId } satisfies BrowserAgentToolInput;
    case "screenshot":
      return { action: "screenshot", sessionId } satisfies BrowserPanelToolInput;
    case "click_xy":
      if (input.x == null || input.y == null) return null;
      return {
        action: "click_xy",
        sessionId,
        x: input.x,
        y: input.y,
      };
    case "pick_element":
      if (input.x == null || input.y == null) return null;
      return {
        action: "pick_element",
        sessionId,
        x: input.x,
        y: input.y,
      };
    default:
      return null;
  }
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.message },
      { status: 400 },
    );
  }

  const toolInput = mapPanelAction(parsed.data);
  if (!toolInput) {
    return NextResponse.json({ ok: false, message: "Missing required fields" }, { status: 400 });
  }

  const result = await executeBrowserTool(toolInput, { audience: "panel" });
  if (result.ok === false) {
    return NextResponse.json(
      { ok: false, message: result.stderr ?? "browser action failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: typeof result.data === "object" && result.data !== null ? result.data : {},
  });
}
