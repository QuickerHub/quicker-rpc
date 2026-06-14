import { isStructuredToolResult } from "@/lib/tool-result";

export const QUICKER_TRIGGER_TOOL = "quicker_trigger";

export type TriggerEventRow = {
  eventType: string;
  description?: string;
  paramKeys: string[];
};

export type TriggerRuleRow = {
  id?: string;
  note?: string;
  enabled?: boolean;
  eventType?: string;
  action?: string;
  paramsJson?: string;
};

export type TriggerEventsResultView = {
  query?: string;
  totalCount?: number;
  matchCount: number;
  items: TriggerEventRow[];
  hint?: string;
};

export type TriggerListResultView = {
  matchCount: number;
  items: TriggerRuleRow[];
  hint?: string;
};

function readQkrpcData(output: unknown): Record<string, unknown> | null {
  if (!isStructuredToolResult(output) || !output.ok) return null;
  const data = output.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

function parseEventRow(raw: unknown): TriggerEventRow | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const eventType = typeof row.eventType === "string" ? row.eventType : "";
  if (!eventType) return null;
  const paramKeys = Array.isArray(row.fields)
    ? row.fields
        .map((field) => {
          if (typeof field !== "object" || field === null || Array.isArray(field)) {
            return null;
          }
          const key = (field as Record<string, unknown>).key;
          return typeof key === "string" && key.trim() ? key.trim() : null;
        })
        .filter((key): key is string => Boolean(key))
    : Array.isArray(row.paramKeys)
      ? row.paramKeys.filter((key): key is string => typeof key === "string")
      : [];
  return {
    eventType,
    description:
      typeof row.description === "string" ? row.description : undefined,
    paramKeys,
  };
}

function parseRuleRow(raw: unknown): TriggerRuleRow | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : undefined;
  const note = typeof row.note === "string" ? row.note : undefined;
  const eventType = typeof row.eventType === "string" ? row.eventType : undefined;
  const action =
    typeof row.actionTitle === "string"
      ? row.actionTitle
      : typeof row.actionIdOrName === "string"
        ? row.actionIdOrName
        : typeof row.action === "string"
          ? row.action
          : undefined;
  if (!id && !note && !eventType && !action) return null;
  return {
    id,
    note,
    enabled:
      typeof row.isEnabled === "boolean"
        ? row.isEnabled
        : typeof row.enabled === "boolean"
          ? row.enabled
          : undefined,
    eventType,
    action,
    paramsJson:
      typeof row.paramsJson === "string" ? row.paramsJson : undefined,
  };
}

export function parseTriggerEventsResultView(
  output: unknown,
): TriggerEventsResultView | null {
  const data = readQkrpcData(output);
  if (!data || data.action !== "trigger-events") return null;
  const items = Array.isArray(data.items)
    ? data.items
        .map(parseEventRow)
        .filter((row): row is TriggerEventRow => row !== null)
    : Array.isArray(data.eventIndex)
      ? data.eventIndex
          .map((row) => {
            if (typeof row !== "object" || row === null || Array.isArray(row)) {
              return null;
            }
            const r = row as Record<string, unknown>;
            const eventType =
              typeof r.eventType === "string" ? r.eventType : "";
            if (!eventType) return null;
            return {
              eventType,
              description:
                typeof r.description === "string" ? r.description : undefined,
              paramKeys: Array.isArray(r.paramKeys)
                ? r.paramKeys.filter((k): k is string => typeof k === "string")
                : [],
            };
          })
          .filter((row): row is TriggerEventRow => row !== null)
      : [];
  return {
    query: typeof data.query === "string" ? data.query : undefined,
    totalCount:
      typeof data.totalCount === "number" ? data.totalCount : undefined,
    matchCount:
      typeof data.matchCount === "number" ? data.matchCount : items.length,
    items,
    hint: typeof data.hint === "string" ? data.hint : undefined,
  };
}

export function parseTriggerListResultView(
  output: unknown,
): TriggerListResultView | null {
  const data = readQkrpcData(output);
  if (!data || data.action !== "trigger-list") return null;
  const items = Array.isArray(data.items)
    ? data.items
        .map(parseRuleRow)
        .filter((row): row is TriggerRuleRow => row !== null)
    : Array.isArray(data.ruleIndex)
      ? data.ruleIndex
          .map(parseRuleRow)
          .filter((row): row is TriggerRuleRow => row !== null)
      : [];
  return {
    matchCount: items.length,
    items,
    hint: typeof data.hint === "string" ? data.hint : undefined,
  };
}

export function triggerToolHasPopupVisual(
  toolName: string,
  input: unknown,
  output: unknown,
): boolean {
  if (toolName !== QUICKER_TRIGGER_TOOL) return false;
  if (parseTriggerEventsResultView(output)) return true;
  if (parseTriggerListResultView(output)) return true;
  if (isStructuredToolResult(output) && !output.ok) return true;
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const action = (input as Record<string, unknown>).action;
    return action === "events" || action === "list";
  }
  return false;
}
