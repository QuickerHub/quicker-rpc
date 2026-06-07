import { tool } from "ai";
import { z } from "zod";
import { invokeBrowserRuntime } from "@/lib/browser-runtime-client.server";
import { BROWSER_TOOL } from "@/lib/browser-tool-constants";
import { formatLocalToolResult } from "@/lib/tool-result";

export { BROWSER_TOOL };

const browserActionSchema = z.enum([
  "status",
  "navigate",
  "snapshot",
  "click",
  "click_xy",
  "type",
  "fill",
  "press",
  "wait",
  "screenshot",
  "tabs",
  "back",
  "forward",
  "reload",
  "close",
]);

const waitUntilSchema = z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional();

export type BrowserToolInput = {
  action: z.infer<typeof browserActionSchema>;
  sessionId?: string;
  url?: string;
  ref?: string;
  x?: number;
  y?: number;
  text?: string;
  value?: string;
  key?: string;
  waitUntil?: z.infer<typeof waitUntilSchema>;
  timeoutMs?: number;
  fullPage?: boolean;
  state?: "attached" | "detached" | "visible" | "hidden";
  delayMs?: number;
};

function sessionId(input: BrowserToolInput): string {
  return input.sessionId?.trim() || "default";
}

function opForAction(action: BrowserToolInput["action"]): string {
  switch (action) {
    case "status":
      return "status";
    case "navigate":
      return "page.navigate";
    case "snapshot":
      return "page.snapshot";
    case "click":
      return "page.click";
    case "click_xy":
      return "page.click_xy";
    case "type":
      return "page.type";
    case "fill":
      return "page.fill";
    case "press":
      return "page.press";
    case "wait":
      return "page.wait";
    case "screenshot":
      return "page.screenshot";
    case "tabs":
      return "page.tabs";
    case "back":
      return "page.back";
    case "forward":
      return "page.forward";
    case "reload":
      return "page.reload";
    case "close":
      return "session.close";
    default:
      return action;
  }
}

const SESSION_ENSURE_ACTIONS = new Set<BrowserToolInput["action"]>([
  "navigate",
  "snapshot",
  "click",
  "click_xy",
  "type",
  "fill",
  "press",
  "wait",
  "screenshot",
  "back",
  "forward",
  "reload",
  "tabs",
]);

export async function executeBrowserTool(
  input: BrowserToolInput,
): Promise<Record<string, unknown>> {
  const sid = sessionId(input);
  const op = opForAction(input.action);

  if (input.action === "navigate") {
    if (!input.url?.trim()) {
      return formatLocalToolResult(null, false, "url is required for navigate");
    }
  }

  if (input.action === "click_xy") {
    if (input.x == null || input.y == null) {
      return formatLocalToolResult(null, false, "x and y are required for click_xy");
    }
  }

  if (SESSION_ENSURE_ACTIONS.has(input.action)) {
    await invokeBrowserRuntime("session.ensure", {}, sid, 60_000);
  }

  const args: Record<string, unknown> = {};
  if (input.url) args.url = input.url;
  if (input.ref) args.ref = input.ref;
  if (input.x != null) args.x = input.x;
  if (input.y != null) args.y = input.y;
  if (input.text != null) args.text = input.text;
  if (input.value != null) args.value = input.value;
  if (input.key) args.key = input.key;
  if (input.waitUntil) args.waitUntil = input.waitUntil;
  if (input.timeoutMs != null) args.timeoutMs = input.timeoutMs;
  if (input.fullPage != null) args.fullPage = input.fullPage;
  if (input.state) args.state = input.state;
  if (input.delayMs != null) args.delayMs = input.delayMs;

  const result = await invokeBrowserRuntime(op, args, sid, input.timeoutMs ?? 120_000);
  if (!result.ok) {
    return formatLocalToolResult(
      { action: input.action, sessionId: sid, op },
      false,
      result.message ?? result.error ?? "browser invoke failed",
    );
  }

  return formatLocalToolResult({
    action: input.action,
    sessionId: sid,
    ...(typeof result.data === "object" && result.data !== null
      ? (result.data as Record<string, unknown>)
      : { data: result.data }),
  });
}

export const BROWSER_TOOL_DEF = tool({
  description:
    "Embedded Playwright browser for web UI. Workflow: navigate → snapshot (refs e1,…) → click/type/fill. "
    + "Use for getquicker pages, login, publish — NOT shell curl, NOT Quicker program edits. "
    + "sessionId isolates cookies (default 'default').",
  inputSchema: z.object({
    action: browserActionSchema.describe(
      "status | navigate | snapshot | click | click_xy | type | fill | press | wait | screenshot | tabs | back | forward | reload | close",
    ),
    sessionId: z
      .string()
      .optional()
      .describe("Browser session id (default 'default'); cookies persist per session profile"),
    url: z.string().optional().describe("Target URL for navigate"),
    ref: z
      .string()
      .optional()
      .describe("Element ref from the latest snapshot (e.g. e3) for click/type/fill/press/wait"),
    x: z.number().int().min(0).optional().describe("Viewport X for click_xy (from embedded panel click)"),
    y: z.number().int().min(0).optional().describe("Viewport Y for click_xy (from embedded panel click)"),
    text: z.string().optional().describe("Text to type (append) for action=type"),
    value: z.string().optional().describe("Value to fill (replace) for action=fill"),
    key: z
      .string()
      .optional()
      .describe("Keyboard key for action=press (Enter, Tab, Escape, …); optional ref focuses first"),
    waitUntil: waitUntilSchema.describe("Page load wait for navigate/reload"),
    timeoutMs: z.number().int().min(500).max(120_000).optional(),
    fullPage: z.boolean().optional().describe("Full page screenshot"),
    state: z
      .enum(["attached", "detached", "visible", "hidden"])
      .optional()
      .describe("wait state when using ref or text"),
    delayMs: z.number().int().min(0).max(500).optional().describe("Per-key delay for type"),
  }),
  execute: async (input: BrowserToolInput) => executeBrowserTool(input),
});
