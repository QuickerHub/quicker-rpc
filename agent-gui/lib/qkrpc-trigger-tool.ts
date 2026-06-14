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
  debounceMs?: number;
  throttleMs?: number;
  skipFurtherTasks?: boolean;
  validForMachines?: string;
};

type TriggerEventItem = {
  eventType?: string;
  description?: string;
  fields?: Array<{ key?: string; label?: string }>;
};

type TriggerRuleItem = {
  id?: string;
  note?: string;
  isEnabled?: boolean;
  eventType?: string;
  paramsJson?: string;
  actionIdOrName?: string;
  actionTitle?: string;
};

const TRIGGER_INTENT_ROUTING =
  "Intent→eventType: 网址/URL→BrowserUrlChanged; 窗口焦点→WindowActivated; "
  + "进程启动→ProcessStarted; 剪贴板→ClipboardChanged; 文件监控→FileSystemChange; "
  + "定时→Repeat; 空闲→IdleTimeExpire. Full table: docs get trigger-workflow.";

const QUICKER_TRIGGER_DESCRIPTION =
  "Quicker 事件触发规则（场景→事件动作）：事件发生时自动运行动作。"
  + " Find eventType: " + TRIGGER_INTENT_ROUTING
  + " Discover: action=events (omit eventType=list all; query=keyword filter); "
  + "existing rules: action=list query=keyword."
  + " Workflow: docs({ action: \"get\", topic: \"trigger-workflow\" }) → events(eventType) → add."
  + " NOT qkrpc_action_run / workspace_program.";

function normalizeTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[|;,/\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function matchesTriggerQuery(haystack: string, query: string): boolean {
  const terms = normalizeTerms(query);
  if (terms.length === 0) return true;
  const hay = haystack.toLowerCase();
  return terms.some((term) => hay.includes(term));
}

function eventHaystack(item: TriggerEventItem): string {
  const fields = (item.fields ?? [])
    .map((f) => `${f.key ?? ""} ${f.label ?? ""}`)
    .join(" ");
  return `${item.eventType ?? ""} ${item.description ?? ""} ${fields}`;
}

function filterTriggerEvents(
  items: TriggerEventItem[],
  query: string | undefined,
): TriggerEventItem[] {
  const q = query?.trim();
  if (!q) return items;
  return items.filter((item) => matchesTriggerQuery(eventHaystack(item), q));
}

function compactEventIndex(items: TriggerEventItem[]) {
  return items.map((item) => ({
    eventType: item.eventType,
    description: item.description,
    paramKeys: (item.fields ?? [])
      .map((f) => f.key)
      .filter((k): k is string => Boolean(k)),
  }));
}

function compactRuleIndex(items: TriggerRuleItem[]) {
  return items.map((item) => ({
    id: item.id,
    note: item.note,
    enabled: item.isEnabled,
    eventType: item.eventType,
    action: item.actionTitle ?? item.actionIdOrName,
    paramsJson: item.paramsJson,
  }));
}

function enrichTriggerToolResult(
  result: Record<string, unknown>,
  verb: string,
  query?: string,
): Record<string, unknown> {
  if (result.ok !== true) return result;
  const data = result.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return result;
  }
  const root = data as Record<string, unknown>;
  const action = root.action;

  if (verb === "events" && action === "trigger-events" && Array.isArray(root.items)) {
    const all = root.items as TriggerEventItem[];
    const filtered = filterTriggerEvents(all, query);
    return {
      ...result,
      data: {
        ...root,
        totalCount: all.length,
        matchCount: filtered.length,
        query: query?.trim() || undefined,
        eventIndex: compactEventIndex(filtered),
        items: filtered,
        hint:
          filtered.length === 0
            ? "No event types matched query — retry events without query or docs search trigger-workflow."
            : "Pick eventType from eventIndex; re-call events with eventType for fields[].helpText and variables[].",
      },
    };
  }

  if (verb === "list" && action === "trigger-list" && Array.isArray(root.items)) {
    const items = root.items as TriggerRuleItem[];
    return {
      ...result,
      data: {
        ...root,
        ruleIndex: compactRuleIndex(items),
        hint: "Use id from ruleIndex for update/enable/disable/delete.",
      },
    };
  }

  return result;
}

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
    const result = formatQkrpcResultForAgent(await runQkrpcForTool(args));
    return enrichTriggerToolResult(result, verb, input.query);
  }

  if (verb === "events") {
    pushStr("--event", input.eventType);
    const result = formatQkrpcResultForAgent(await runQkrpcForTool(args));
    return enrichTriggerToolResult(result, verb, input.query);
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
  pushStr("--machines", input.validForMachines);
  if (input.debounceMs != null) {
    args.push("--debounce", String(input.debounceMs));
  }
  if (input.throttleMs != null) {
    args.push("--throttle", String(input.throttleMs));
  }
  if (input.delayMs != null) {
    args.push("--delay", String(input.delayMs));
  }
  if (input.skipFurtherTasks === true) {
    args.push("--skip-further");
  }
  if (input.enabled === true) args.push("--enabled");
  if (input.enabled === false) args.push("--disabled");

  return formatQkrpcResultForAgent(await runQkrpcForTool(args));
}

export const QUICKER_TRIGGER_TOOL_DEF = tool({
  description: QUICKER_TRIGGER_DESCRIPTION,
  inputSchema: z.object({
    action: triggerActionSchema.describe(
      "list=find existing rules (query); events=event catalog + schema (query filters types); "
      + "add|update=save; delete|enable|disable by id",
    ),
    id: z
      .string()
      .optional()
      .describe("Rule Guid — required for update/delete/enable/disable; from list ruleIndex[].id"),
    eventType: z
      .string()
      .optional()
      .describe(
        "events: optional filter to one type; add/update: exact id from eventIndex "
        + "(BrowserUrlChanged, WindowActivated, ClipboardChanged, Repeat, …)",
      ),
    actionIdOrName: z
      .string()
      .optional()
      .describe(
        "add: action Guid or unique action title to run; "
        + "resolve id via qkrpc_action_query if unknown",
      ),
    actionParam: z
      .string()
      .optional()
      .describe(
        "add/update: static text passed as quicker_in_param; "
        + "may use $$ interpolation of event variables, e.g. $$Url={Url}&TabId={TabId}",
      ),
    params: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "add/update: 触发条件 JSON — keys ONLY from events fields[].key; "
        + "read fields[].helpText for each key. Value rules: "
        + "Text=single value | semicolon OR-list | regex:<pattern> (UrlPattern is URL prefix, not bare regex); "
        + "Boolean=true/false; Integer/Number=numeric; "
        + "Enum=value after | in fields[].selectionItems (label|VALUE). "
        + "All non-empty params must match (AND). update replaces whole object when set.",
      ),
    note: z
      .string()
      .optional()
      .describe("add/update: human-readable label; list filters by query"),
    filter: z
      .string()
      .optional()
      .describe(
        "add/update: optional 附加过滤 — $= boolean expression on events variables[].key; "
        + "reference vars as {VarName} (e.g. $={Url}.Contains(\"issue\")); "
        + "must return true to fire; omit when params already narrow enough",
      ),
    query: z
      .string()
      .optional()
      .describe(
        "list: keyword on note/eventType/action/id; "
        + "events: keyword filter on eventType/description/field labels (e.g. 网址, clipboard, 定时, file)",
      ),
    enabled: z
      .boolean()
      .optional()
      .describe("add/update: true=enabled, false=disabled (add defaults enabled)"),
    delayMs: z
      .number()
      .int()
      .optional()
      .describe("add/update: ms to wait after event before running action (e.g. 800 for slow UI)"),
    debounceMs: z
      .number()
      .int()
      .optional()
      .describe("add/update: suppress re-fire within N ms after last trigger"),
    throttleMs: z
      .number()
      .int()
      .optional()
      .describe(
        "add/update: run at most once per N ms while events keep firing "
        + "(e.g. 1000 for FileSystemChange)",
      ),
    skipFurtherTasks: z
      .boolean()
      .optional()
      .describe(
        "add/update: true = stop evaluating later rules for same event "
        + "(avoid on Repeat/Idle/FileSystemChange)",
      ),
    validForMachines: z
      .string()
      .optional()
      .describe(
        "add/update: host binding; semicolon-separated machine names; omit = all machines",
      ),
  }),
  execute: executeQuickerTriggerTool,
});
