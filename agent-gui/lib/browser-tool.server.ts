import { tool } from "ai";
import { z } from "zod";
import { invokeBrowserRuntime } from "@/lib/browser-runtime-client.server";
import {
  invokeEmbeddedBrowserRuntime,
  isEmbeddedBrowserRuntimeAvailable,
  shouldFallbackToPlaywrightBrowserResult,
} from "@/lib/embedded-browser-runtime-client.server";
import { isNativeEmbeddedBrowserEnabled } from "@/lib/browser-native-mode";
import { BROWSER_TOOL } from "@/lib/browser-tool-constants";
import {
  sanitizeBrowserToolDataForAgent,
  type BrowserToolAudience,
} from "@/lib/browser-tool-result";
import { normalizeEmbeddedBrowserUrl } from "@/lib/embedded-browser-url";
import { formatLocalToolResult } from "@/lib/tool-result";

export { BROWSER_TOOL };

/** Actions exposed to the LLM via the browser tool. Screenshot is panel-only (useless to agents). */
const browserAgentActionSchema = z.enum([
  "status",
  "navigate",
  "snapshot",
  "search",
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
  limit?: number;
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
    case "search":
      return "page.search";
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
  "search",
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
  /** Set when native Electron runtime was unavailable and Playwright was used instead. */
  fallbackFromNative?: boolean;
};

/** Agent automation runs headless Playwright — no side-panel WebView mount required. */
function shouldUseHeadlessPlaywrightForAudience(
  audience: BrowserToolAudience,
): boolean {
  return audience === "agent";
}

function shouldFallbackToPlaywrightFromNativeToolResult(
  result: Record<string, unknown>,
): boolean {
  if (result.ok === true) return false;
  const stderr = String(result.stderr ?? "");
  const data =
    typeof result.data === "object" && result.data !== null
      ? (result.data as Record<string, unknown>)
      : {};
  return shouldFallbackToPlaywrightBrowserResult({
    ok: false,
    message: stderr,
    error: typeof data.op === "string" ? data.op : undefined,
  }) || stderr.toLowerCase().includes("embedded browser session not ready");
}

async function executeNativeEmbeddedBrowserTool(
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
    const normalized = normalizeEmbeddedBrowserUrl(input.url);
    if (!normalized) {
      return formatLocalToolResult(null, false, "url is invalid");
    }
    input = { ...input, url: normalized };
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

  if (input.action === "search" && !input.text?.trim()) {
    return formatLocalToolResult(null, false, "text is required for search (page text query)");
  }

  if (input.action === "tab" && (input.index == null || input.index < 0)) {
    return formatLocalToolResult(
      null,
      false,
      "index is required for tab (use action=tabs to list open tabs)",
    );
  }

  const op =
    input.action === "status"
      ? "status"
      : input.action === "close"
        ? "session.close"
        : opForAction(input.action);

  const nativeEnsureActions = new Set(
    [...SESSION_ENSURE_ACTIONS].filter((action) => action !== "navigate"),
  );
  if (nativeEnsureActions.has(input.action)) {
    const ensured = await invokeEmbeddedBrowserRuntime("session.ensure", {}, sid, 60_000);
    if (!ensured.ok) {
      return formatLocalToolResult(
        { action: input.action, sessionId: sid, op: "session.ensure", mode: "native" },
        false,
        ensured.message ?? ensured.error ?? "embedded browser session not ready",
      );
    }
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
  if (input.limit != null) args.limit = input.limit;
  args.includePreview = audience === "panel";

  const result = await invokeEmbeddedBrowserRuntime(
    op,
    args,
    sid,
    input.timeoutMs ?? 120_000,
  );

  if (!result.ok) {
    if (input.action === "navigate" && input.url) {
      return formatLocalToolResult({
        action: "navigate",
        sessionId: sid,
        url: input.url,
        title: "",
        mode: "native",
        deferred: true,
        message:
          result.message
          ?? "Side panel will open the page; retry snapshot/evaluate after the view mounts.",
      });
    }
    return formatLocalToolResult(
      { action: input.action, sessionId: sid, op, mode: "native" },
      false,
      result.message ?? result.error ?? "embedded browser invoke failed",
    );
  }

  const runtimeData =
    typeof result.data === "object" && result.data !== null
      ? (result.data as Record<string, unknown>)
      : { data: result.data };

  const payload: Record<string, unknown> = {
    action: input.action,
    sessionId: sid,
    mode: "native",
    ...runtimeData,
  };

  if (input.action === "navigate" && input.url && !payload.url) {
    payload.url = input.url;
  }

  const data =
    audience === "agent" ? sanitizeBrowserToolDataForAgent(payload) : payload;

  return formatLocalToolResult(data);
}

async function executePlaywrightBrowserTool(
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

  if (input.action === "search" && !input.text?.trim()) {
    return formatLocalToolResult(null, false, "text is required for search (page text query)");
  }

  if (input.url?.trim()) {
    const normalized = normalizeEmbeddedBrowserUrl(input.url);
    if (!normalized) {
      return formatLocalToolResult(null, false, "url is invalid");
    }
    input = { ...input, url: normalized };
  }

  if (input.action === "tab" && (input.index == null || input.index < 0)) {
    return formatLocalToolResult(
      null,
      false,
      "index is required for tab (use action=tabs to list open tabs)",
    );
  }

  const op = opForAction(input.action);

  const urlBootstrapsSession =
    Boolean(input.url?.trim())
    && (input.action === "evaluate" || input.action === "content" || input.action === "search");

  if (SESSION_ENSURE_ACTIONS.has(input.action) && !urlBootstrapsSession) {
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
  if (input.limit != null) args.limit = input.limit;
  args.includePreview = audience === "panel";

  const result = await invokeBrowserRuntime(op, args, sid, input.timeoutMs ?? 120_000);
  if (!result.ok) {
    return formatLocalToolResult(
      {
        action: input.action,
        sessionId: sid,
        op,
        mode: "playwright",
        ...(options?.fallbackFromNative ? { fallbackFromNative: true } : {}),
      },
      false,
      result.message ?? result.error ?? "browser invoke failed",
    );
  }

  const payload: Record<string, unknown> = {
    action: input.action,
    sessionId: sid,
    mode: "playwright",
    ...(audience === "agent" ? { background: true } : {}),
    ...(options?.fallbackFromNative ? { fallbackFromNative: true } : {}),
    ...(typeof result.data === "object" && result.data !== null
      ? (result.data as Record<string, unknown>)
      : { data: result.data }),
  };

  const data =
    audience === "agent" ? sanitizeBrowserToolDataForAgent(payload) : payload;

  return formatLocalToolResult(data);
}

export async function executeBrowserTool(
  input: BrowserToolInput,
  options?: ExecuteBrowserToolOptions,
): Promise<Record<string, unknown>> {
  const audience = options?.audience ?? "agent";
  if (shouldUseHeadlessPlaywrightForAudience(audience)) {
    return executePlaywrightBrowserTool(input, options);
  }

  if (!isNativeEmbeddedBrowserEnabled()) {
    return executePlaywrightBrowserTool(input, options);
  }

  if (await isEmbeddedBrowserRuntimeAvailable()) {
    const nativeResult = await executeNativeEmbeddedBrowserTool(input, options);
    if (nativeResult.ok === true) {
      return nativeResult;
    }
    if (shouldFallbackToPlaywrightFromNativeToolResult(nativeResult)) {
      return executePlaywrightBrowserTool(input, {
        ...options,
        fallbackFromNative: true,
      });
    }
    return nativeResult;
  }

  return executePlaywrightBrowserTool(input, {
    ...options,
    fallbackFromNative: true,
  });
}

export const BROWSER_TOOL_DEF = tool({
  description:
    "Headless browser automation (Playwright) — runs in the background; does not open the side panel. "
    + "evaluate(script, url?) runs JS on a page: pass url to load and extract in one call (scraping, batch data). "
    + "content(url?, selector?) for long text; search(text, url?) for element refs (e1, e2, …). "
    + "navigate(url) returns interactive snapshot when you need refs before click/type/fill. "
    + "Use web_search for discovery. Do NOT use screenshot — agents cannot use images. "
    + "sessionId maps to browser profile (default thread id); cookies persist per session.",
  inputSchema: z.object({
    action: browserAgentActionSchema.describe(
      "status | navigate | snapshot | search | content | click | click_xy | type | fill | press | wait | scroll | evaluate | tabs | tab | back | forward | reload | close",
    ),
    sessionId: z
      .string()
      .optional()
      .describe("Browser session id (default 'default'); cookies persist per session profile"),
    url: z
      .string()
      .optional()
      .describe(
        "action=navigate: open URL; evaluate/content/search: load this page first (one-shot background automation)",
      ),
    ref: z
      .string()
      .optional()
      .describe("Element ref from the latest snapshot (e.g. e3) for click/type/fill/press/wait"),
    x: z.number().int().min(0).optional().describe("Viewport X for click_xy (from embedded panel click)"),
    y: z.number().int().min(0).optional().describe("Viewport Y for click_xy (from embedded panel click)"),
    text: z
      .string()
      .optional()
      .describe(
        "action=search: keyword to find on page (returns ref matches); "
        + "action=type: text to append; action=wait: visible text to wait for",
      ),
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
      .describe(
        "JavaScript for action=evaluate: optional url loads the page first. "
        + "End with an expression (e.g. document.title; "
        + "[...document.querySelectorAll('a')].map(a => a.href)) or use return for multi-line bodies. "
        + "Result is in value (objects/arrays stay structured; other scalars as strings).",
      ),
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
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Max matches for action=search (default 8)"),
  }),
  execute: async (input: BrowserAgentToolInput) => executeBrowserTool(input),
});
