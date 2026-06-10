import { tool } from "ai";
import { z } from "zod";
import { invokeBrowserRuntime } from "@/lib/browser-runtime-client.server";
import { BROWSER_TOOL } from "@/lib/browser-tool-constants";
import {
  sanitizeBrowserToolDataForAgent,
  type BrowserToolAudience,
} from "@/lib/browser-tool-result";
import { formatLocalToolResult } from "@/lib/tool-result";

export { BROWSER_TOOL };

/** Actions exposed to the LLM via the browser tool. Screenshot is panel-only (useless to agents). */
const browserAgentActionSchema = z.enum([
  "status",
  "navigate",
  "snapshot",
  "content",
  "click",
  "click_xy",
  "type",
  "fill",
  "press",
  "wait",
  "scroll",
  "evaluate",
  "tabs",
  "tab",
  "back",
  "forward",
  "reload",
  "close",
]);

/** Side-panel API only — captures preview images for the embedded browser UI. */
const browserPanelOnlyActionSchema = z.enum(["screenshot", "pick_element"]);

const browserRuntimeActionSchema = z.union([
  browserAgentActionSchema,
  browserPanelOnlyActionSchema,
]);

const waitUntilSchema = z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional();

type BrowserToolInputBase = {
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
  deltaX?: number;
  deltaY?: number;
  script?: string;
  selector?: string;
  offset?: number;
  index?: number;
};

export type BrowserAgentToolInput = BrowserToolInputBase & {
  action: z.infer<typeof browserAgentActionSchema>;
};

export type BrowserPanelToolInput = BrowserToolInputBase & {
  action: z.infer<typeof browserPanelOnlyActionSchema>;
};

export type BrowserToolInput = BrowserAgentToolInput | BrowserPanelToolInput;

function sessionId(input: BrowserToolInput): string {
  return input.sessionId?.trim() || "default";
}

function opForAction(action: z.infer<typeof browserRuntimeActionSchema>): string {
  switch (action) {
    case "status":
      return "status";
    case "navigate":
      return "page.navigate";
    case "snapshot":
      return "page.snapshot";
    case "content":
      return "page.content";
    case "click":
      return "page.click";
    case "click_xy":
      return "page.click_xy";
    case "pick_element":
      return "page.pick_element";
    case "type":
      return "page.type";
    case "fill":
      return "page.fill";
    case "press":
      return "page.press";
    case "wait":
      return "page.wait";
    case "scroll":
      return "page.scroll";
    case "evaluate":
      return "page.evaluate";
    case "screenshot":
      return "page.screenshot";
    case "tabs":
      return "page.tabs";
    case "tab":
      return "page.tab_select";
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

const SESSION_ENSURE_ACTIONS = new Set<z.infer<typeof browserRuntimeActionSchema>>([
  "navigate",
  "snapshot",
  "content",
  "click",
  "click_xy",
  "pick_element",
  "type",
  "fill",
  "press",
  "wait",
  "scroll",
  "evaluate",
  "screenshot",
  "back",
  "forward",
  "reload",
  "tabs",
  "tab",
]);

export type ExecuteBrowserToolOptions = {
  /** agent: text-only tool result for LLM; panel: keep preview images for side panel API */
  audience?: BrowserToolAudience;
};

export async function executeBrowserTool(
  input: BrowserToolInput,
  options?: ExecuteBrowserToolOptions,
): Promise<Record<string, unknown>> {
  const audience = options?.audience ?? "agent";
  const sid = sessionId(input);

  if (audience === "agent" && input.action === "screenshot") {
    return formatLocalToolResult(
      null,
      false,
      "screenshot is not available to the agent; use snapshot or content. Side panel shows live preview.",
    );
  }

  if (audience === "agent" && input.action === "pick_element") {
    return formatLocalToolResult(
      null,
      false,
      "pick_element is panel-only; user picks elements in the side-panel browser UI.",
    );
  }

  if (input.action === "navigate") {
    if (!input.url?.trim()) {
      return formatLocalToolResult(null, false, "url is required for navigate");
    }
  }

  if (input.action === "click_xy" || input.action === "pick_element") {
    if (input.x == null || input.y == null) {
      return formatLocalToolResult(
        null,
        false,
        `x and y are required for ${input.action}`,
      );
    }
  }

  if (input.action === "evaluate" && !input.script?.trim()) {
    return formatLocalToolResult(null, false, "script is required for evaluate");
  }

  if (input.action === "tab" && (input.index == null || input.index < 0)) {
    return formatLocalToolResult(
      null,
      false,
      "index is required for tab (use action=tabs to list open tabs)",
    );
  }

  const op = opForAction(input.action);

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
  if (input.deltaX != null) args.deltaX = input.deltaX;
  if (input.deltaY != null) args.deltaY = input.deltaY;
  if (input.script) args.script = input.script;
  if (input.selector?.trim()) args.selector = input.selector.trim();
  if (input.offset != null) args.offset = input.offset;
  if (input.index != null) args.index = input.index;
  args.includePreview = audience === "panel";

  const result = await invokeBrowserRuntime(op, args, sid, input.timeoutMs ?? 120_000);
  if (!result.ok) {
    return formatLocalToolResult(
      { action: input.action, sessionId: sid, op },
      false,
      result.message ?? result.error ?? "browser invoke failed",
    );
  }

  const payload: Record<string, unknown> = {
    action: input.action,
    sessionId: sid,
    ...(typeof result.data === "object" && result.data !== null
      ? (result.data as Record<string, unknown>)
      : { data: result.data }),
  };

  const data =
    audience === "agent" ? sanitizeBrowserToolDataForAgent(payload) : payload;

  return formatLocalToolResult(data);
}

export const BROWSER_TOOL_DEF = tool({
  description:
    "Embedded Playwright browser (side panel shows live preview; tool results are text-only). "
    + "READ workflow: navigate(url) → content (readable text; selector= CSS scope, offset= paginate long pages via nextOffset) or evaluate for structured DOM/JSON extraction. "
    + "ACT workflow: navigate → snapshot (YAML refs e1,e2,…) → click/type/fill/press by ref. "
    + "After click/press the result may include navigated:true or openedTab:true — old refs are then invalid, snapshot again before the next ref action. "
    + "Popups (target=_blank) are followed automatically; tabs lists open tabs, tab(index) switches back. "
    + "Do NOT use screenshot — agents cannot use images; snapshot + content cover page understanding. "
    + "For getquicker login/publish — NOT shell curl, NOT Quicker program edits. "
    + "sessionId isolates cookies (default 'default'); logins persist across restarts per session.",
  inputSchema: z.object({
    action: browserAgentActionSchema.describe(
      "status | navigate | snapshot | content | click | click_xy | type | fill | press | wait | scroll | evaluate | tabs | tab | back | forward | reload | close",
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
    state: z
      .enum(["attached", "detached", "visible", "hidden"])
      .optional()
      .describe("wait state when using ref or text"),
    delayMs: z.number().int().min(0).max(500).optional().describe("Per-key delay for type"),
    deltaX: z.number().int().optional().describe("Horizontal wheel delta for action=scroll"),
    deltaY: z.number().int().optional().describe("Vertical wheel delta for action=scroll; default 600"),
    script: z
      .string()
      .optional()
      .describe("JavaScript expression/function body for action=evaluate; return JSON-serializable data"),
    selector: z
      .string()
      .optional()
      .describe("CSS selector for action=content: extract text from matching elements only (e.g. 'article', '.result-item')"),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Char offset for action=content pagination; pass the previous result's nextOffset to continue"),
    index: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Tab index for action=tab (from action=tabs)"),
  }),
  execute: async (input: BrowserAgentToolInput) => executeBrowserTool(input),
});
