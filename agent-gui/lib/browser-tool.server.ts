import { tool } from "ai";
import { z } from "zod";
import { executeBrowserAutomation } from "@/lib/browser/facade";
import type {
  BrowserAgentToolInput,
  BrowserPanelToolInput,
  BrowserToolInput,
} from "@/lib/browser/input-types";
import { BROWSER_TOOL } from "@/lib/browser-tool-constants";
import type { BrowserToolAudience } from "@/lib/browser-tool-result";

export { BROWSER_TOOL };
export type {
  BrowserAgentToolInput,
  BrowserPanelToolInput,
  BrowserToolInput,
} from "@/lib/browser/input-types";

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

const browserTargetSchema = z.enum(["auto", "headless", "embedded"]);

const waitUntilSchema = z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional();

export type ExecuteBrowserToolOptions = {
  /** agent: text-only tool result for LLM; panel: keep preview images for side panel API */
  audience?: BrowserToolAudience;
  /** Set when native Electron runtime was unavailable and Playwright was used instead. */
  fallbackFromNative?: boolean;
  showPanel?: boolean;
};

export async function executeBrowserTool(
  input: BrowserToolInput,
  options?: ExecuteBrowserToolOptions,
): Promise<Record<string, unknown>> {
  return executeBrowserAutomation(input, options);
}

export const BROWSER_TOOL_DEF = tool({
  description:
    "Browser automation. Default: headless Playwright in the background (evaluate/content for scraping). "
    + "Set showPanel=true to open the in-app embedded browser (Electron only). "
    + "Set target=embedded for offscreen embedded Chromium scripts (shared sessionId profile with side panel). "
    + "For the user's logged-in Chrome/Edge with cookies, use user_browser — NOT this tool. "
    + "evaluate(script, url?) runs JS: pass url to load and extract in one call. "
    + "content(url?, selector?) for long text; search(text, url?) for element refs (e1, e2, …). "
    + "navigate(url) returns interactive snapshot when you need refs before click/type/fill. "
    + "Use web_search for discovery. Do NOT use screenshot — agents cannot use images. "
    + "sessionId maps to browser profile (default thread id); cookies persist per session.",
  inputSchema: z.object({
    action: browserAgentActionSchema.describe(
      "status | navigate | snapshot | search | content | click | click_xy | type | fill | press | wait | scroll | evaluate | tabs | tab | back | forward | reload | close",
    ),
    target: browserTargetSchema
      .optional()
      .describe("auto (default headless) | headless (Playwright) | embedded (Electron Chromium)"),
    showPanel: z
      .boolean()
      .optional()
      .describe("true opens the side-panel embedded browser (Electron); default false = background"),
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
