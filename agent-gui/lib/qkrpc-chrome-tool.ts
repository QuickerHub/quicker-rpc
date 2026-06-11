import { tool } from "ai";
import { z } from "zod";
import { formatQkrpcResultForAgent, runQkrpcForTool } from "@/lib/qkrpc";

export const USER_BROWSER_TOOL = "user_browser";

const chromeOperationSchema = z.string().min(1);

const userBrowserActionSchema = z.enum(["run", "tabs"]);

export type UserBrowserToolInput = {
  action: z.infer<typeof userBrowserActionSchema>;
  operation?: string;
  parameters?: Record<string, unknown>;
  sessionId?: string;
};

export async function executeUserBrowserTool(
  input: UserBrowserToolInput,
): Promise<Record<string, unknown>> {
  if (input.action === "tabs") {
    const raw = await runQkrpcForTool(["chrome", "tabs", "--json"]);
    return formatQkrpcResultForAgent(raw);
  }

  const operation = input.operation?.trim();
  if (!operation) {
    return { ok: false, errorMessage: "operation is required when action=run" };
  }

  const paramsJson = input.parameters ? JSON.stringify(input.parameters) : undefined;
  const args = ["chrome", "run", "--operation", operation, "--json"];
  if (paramsJson) {
    args.push("--params", paramsJson);
  }
  if (input.sessionId?.trim()) {
    args.push("--session", input.sessionId.trim());
  }

  const raw = await runQkrpcForTool(args);
  return formatQkrpcResultForAgent(raw);
}

export const USER_BROWSER_TOOL_DEF = tool({
  description:
    "Control the user's real browser (Chrome/Edge/Firefox with Quicker Connector extension). "
    + "Uses logged-in profile/cookies — NOT the Playwright `browser` tool. "
    + "action=tabs lists open tabs; action=run executes sys:chromecontrol operations "
    + "(OpenUrl, RunScript, GetTabInfo, ActivateTab, GetElementInfo, …). "
    + "Reuse sessionId; tabId from OpenUrl is carried when omitted. "
    + "Schema: qkrpc_step_runner_get key=sys:chromecontrol.",
  inputSchema: z.object({
    action: userBrowserActionSchema.describe("run | tabs"),
    operation: chromeOperationSchema
      .optional()
      .describe("ChromeControl operation when action=run"),
    parameters: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Step inputParams object (url, tabId, script, selector, …)"),
    sessionId: z
      .string()
      .optional()
      .describe("Reuse browser/tab context across calls (default: default)"),
  }),
  execute: executeUserBrowserTool,
});
