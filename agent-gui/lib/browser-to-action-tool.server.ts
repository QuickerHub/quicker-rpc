import { tool } from "ai";
import { z } from "zod";
import { convertBrowserRecordingsToAction } from "@/lib/browser-to-action/convert";
import {
  clearBrowserRecordings,
  getBrowserRecordings,
} from "@/lib/browser-to-action/recording";
import type { BrowserRecordingEntry } from "@/lib/browser-to-action/types";
import { formatLocalToolResult } from "@/lib/tool-result";

export const BROWSER_TO_ACTION_TOOL = "browser_to_action";

const recordingEntrySchema = z.object({
  source: z.enum(["browser", "user_browser"]),
  input: z.record(z.string(), z.unknown()),
  refTarget: z
    .object({
      role: z.string(),
      name: z.string().nullable().optional(),
      nth: z.number().int().min(0).optional(),
    })
    .optional(),
  selector: z.string().optional(),
});

export type BrowserToActionToolInput = {
  source?: "session" | "recordings";
  sessionId?: string;
  recordings?: BrowserRecordingEntry[];
  tabVariable?: string;
  addComments?: boolean;
  clipboardFromLastScript?: boolean;
  clearSessionAfter?: boolean;
};

export async function executeBrowserToActionTool(
  input: BrowserToActionToolInput,
): Promise<Record<string, unknown>> {
  const source = input.source ?? "session";
  const sessionId = input.sessionId?.trim() || "default";

  let recordings: BrowserRecordingEntry[] = [];
  if (source === "recordings") {
    recordings = input.recordings ?? [];
  } else {
    recordings = getBrowserRecordings(sessionId);
  }

  const result = convertBrowserRecordingsToAction(recordings, {
    tabVariable: input.tabVariable,
    addComments: input.addComments,
    clipboardFromLastScript: input.clipboardFromLastScript,
  });

  if (input.clearSessionAfter && source === "session") {
    clearBrowserRecordings(sessionId);
  }

  return formatLocalToolResult(
    {
      summary: result.summary,
      stepCount: result.steps.filter((s) => s.stepRunnerKey !== "sys:comment").length,
      dataJson: result.dataJson,
      warnings: result.warnings,
      skipped: result.skipped,
      nextSteps:
        "qkrpc_action_create → workspace_program write_data (dataJson) → patch → qkrpc_action_debug. "
        + "Requires Quicker Connector for sys:chromecontrol at runtime.",
    },
    result.ok,
    result.ok ? undefined : result.summary,
  );
}

export const BROWSER_TO_ACTION_TOOL_DEF = tool({
  description:
    "Convert browser automation (browser / user_browser calls) into Quicker action steps (sys:chromecontrol). "
    + "Default source=session reads recorded calls for sessionId (same as browser tool session). "
    + "Or pass source=recordings with explicit entries. "
    + "Returns dataJson for workspace_program write_data — then patch and action_debug. "
    + "Prototype with browser first; production actions use user's extension browser.",
  inputSchema: z.object({
    source: z
      .enum(["session", "recordings"])
      .optional()
      .describe("session (default): in-memory log from this chat's browser calls; recordings: explicit list"),
    sessionId: z
      .string()
      .optional()
      .describe("Browser session id (default default); must match browser tool sessionId"),
    recordings: z
      .array(recordingEntrySchema)
      .optional()
      .describe("Required when source=recordings"),
    tabVariable: z
      .string()
      .optional()
      .describe("Variable key for tabId output (default browserTab)"),
    addComments: z
      .boolean()
      .optional()
      .describe("Insert sys:comment steps (default true)"),
    clipboardFromLastScript: z
      .boolean()
      .optional()
      .describe("Append writeclipboard from last script result variable"),
    clearSessionAfter: z
      .boolean()
      .optional()
      .describe("Clear session recording buffer after convert (default false)"),
  }),
  execute: executeBrowserToActionTool,
});
