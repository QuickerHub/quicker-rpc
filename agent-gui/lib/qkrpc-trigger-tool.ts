import { tool } from "ai";
import { z } from "zod";
import { formatQkrpcResultForAgent, runQkrpcForTool } from "@/lib/qkrpc";

export const QUICKER_TRIGGER_TOOL = "quicker_trigger";

const triggerActionSchema = z.enum([
  "list",
  "events",
  "add",
  "update",
  "delete",
  "enable",
  "disable",
]);

export type QuickerTriggerToolInput = {
  action: z.infer<typeof triggerActionSchema>;
  id?: string;
  eventType?: string;
  actionIdOrName?: string;
  actionParam?: string;
  params?: Record<string, unknown>;
  note?: string;
  filter?: string;
  query?: string;
  enabled?: boolean;
  delayMs?: number;
};

export async function executeQuickerTriggerTool(
  input: QuickerTriggerToolInput,
): Promise<Record<string, unknown>> {
  const verb = input.action;
  const args = ["trigger", verb, "--json"];

  const pushStr = (flag: string, value: string | undefined) => {
    const v = value?.trim();
    if (v) args.push(flag, v);
  };

  if (verb === "list") {
    pushStr("--query", input.query);
    pushStr("--event", input.eventType);
    return formatQkrpcResultForAgent(await runQkrpcForTool(args));
  }

  if (verb === "events") {
    pushStr("--event", input.eventType);
    return formatQkrpcResultForAgent(await runQkrpcForTool(args));
  }

  if (verb === "delete" || verb === "enable" || verb === "disable") {
    if (!input.id?.trim()) {
      return { ok: false, errorMessage: `id is required for ${verb}` };
    }
    pushStr("--id", input.id);
    return formatQkrpcResultForAgent(await runQkrpcForTool(args));
  }

  // add / update
  if (verb === "update" && !input.id?.trim()) {
    return { ok: false, errorMessage: "id is required for update" };
  }
  if (verb === "add" && (!input.eventType?.trim() || !input.actionIdOrName?.trim())) {
    return {
      ok: false,
      errorMessage:
        "eventType and actionIdOrName are required for add (call action=events first)",
    };
  }

  if (verb === "update") pushStr("--id", input.id);
  pushStr("--event", input.eventType);
  pushStr("--action", input.actionIdOrName);
  if (input.actionParam !== undefined) {
    args.push("--action-param", input.actionParam);
  }
  if (input.params && Object.keys(input.params).length > 0) {
    args.push("--params", JSON.stringify(input.params));
  }
  pushStr("--note", input.note);
  pushStr("--filter", input.filter);
  if (input.delayMs != null) {
    args.push("--delay", String(input.delayMs));
  }
  if (input.enabled === true) args.push("--enabled");
  if (input.enabled === false) args.push("--disabled");

  return formatQkrpcResultForAgent(await runQkrpcForTool(args));
}

export const QUICKER_TRIGGER_TOOL_DEF = tool({
  description:
    "Quicker event trigger rules — run an action automatically on system events "
    + "(BrowserUrlChanged, WindowActivated, ProcessStarted, ClipboardChanged, FileSystemChange, Repeat timer, …). "
    + "ALWAYS call action=events first to get exact eventType + params keys before add/update. "
    + "NOT for running actions now (qkrpc_action_run) or editing steps (workspace_program).",
  inputSchema: z.object({
    action: triggerActionSchema.describe(
      "list | events | add | update | delete | enable | disable",
    ),
    id: z
      .string()
      .optional()
      .describe("Trigger rule id (update/delete/enable/disable)"),
    eventType: z
      .string()
      .optional()
      .describe("Event type id, case sensitive (from action=events, e.g. BrowserUrlChanged)"),
    actionIdOrName: z
      .string()
      .optional()
      .describe("Action id (Guid) or action title to run when triggered"),
    actionParam: z
      .string()
      .optional()
      .describe("Parameter passed to the triggered action"),
    params: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Event params object (keys from action=events, e.g. {UrlPattern, OnlyActiveTab})"),
    note: z.string().optional().describe("Display note for the rule"),
    filter: z
      .string()
      .optional()
      .describe("Event filter expression evaluated against event variables"),
    query: z
      .string()
      .optional()
      .describe("list: filter by note/event/action/id keyword"),
    enabled: z
      .boolean()
      .optional()
      .describe("add/update: create or set the rule enabled (true) / disabled (false)"),
    delayMs: z
      .number()
      .int()
      .optional()
      .describe("Delay before running the action, milliseconds"),
  }),
  execute: executeQuickerTriggerTool,
});
