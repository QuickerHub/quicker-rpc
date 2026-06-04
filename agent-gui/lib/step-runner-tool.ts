import { isStructuredToolResult } from "./tool-result";

export type StepRunnerGetMeta = {
  key: string;
  name?: string;
  controlField?: string;
};

export type StepRunnerSearchMeta = {
  query?: string;
  matchCount: number;
};

export type StepRunnerSearchControlField = {
  key: string;
  value: string;
  name?: string;
};

export type StepRunnerSearchItemRow = {
  key: string;
  name: string;
  description?: string;
  controlField?: StepRunnerSearchControlField;
};

export type StepRunnerSearchResult = StepRunnerSearchMeta & {
  items: StepRunnerSearchItemRow[];
  controlFieldItemCount?: number;
};

const STEP_RUNNER_GET_TOOLS = new Set(["qkrpc_step_runner_get"]);
const STEP_RUNNER_SEARCH_TOOLS = new Set(["qkrpc_step_runner_search"]);

export function isStepRunnerGetTool(toolName: string): boolean {
  return STEP_RUNNER_GET_TOOLS.has(toolName);
}

export function isStepRunnerSearchTool(toolName: string): boolean {
  return STEP_RUNNER_SEARCH_TOOLS.has(toolName);
}

export function isStepRunnerTool(toolName: string): boolean {
  return isStepRunnerGetTool(toolName) || isStepRunnerSearchTool(toolName);
}

function readString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function readBool(obj: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function readInt(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function unwrapPayload(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "object" || data === null) return null;
  const root = data as Record<string, unknown>;
  if (typeof root.payload === "object" && root.payload !== null) {
    return root.payload as Record<string, unknown>;
  }
  if (typeof root.Payload === "object" && root.Payload !== null) {
    return root.Payload as Record<string, unknown>;
  }
  return root;
}

function readAction(data: Record<string, unknown>): string | undefined {
  return readString(data, "action", "Action");
}

function extractSchemaInfo(payload: Record<string, unknown>): {
  key?: string;
  name?: string;
} {
  const schemaJson = payload.schemaJson ?? payload.SchemaJson;
  if (typeof schemaJson === "string" && schemaJson.trim()) {
    try {
      const parsed = JSON.parse(schemaJson) as Record<string, unknown>;
      return {
        key: readString(parsed, "StepRunnerKey", "stepRunnerKey"),
        name: readString(parsed, "Name", "name"),
      };
    } catch {
      /* ignore malformed schemaJson */
    }
  }

  const schema = payload.schema ?? payload.Schema;
  if (typeof schema === "object" && schema !== null && !Array.isArray(schema)) {
    const s = schema as Record<string, unknown>;
    return {
      key: readString(s, "StepRunnerKey", "stepRunnerKey"),
      name: readString(s, "Name", "name"),
    };
  }

  return {};
}

export function parseStepRunnerGetInput(
  input: unknown,
): { key: string; controlField?: string } | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const obj = input as Record<string, unknown>;
  const key = readString(obj, "key", "Key");
  if (!key) return null;

  const extraKeys = Object.keys(obj).filter(
    (k) => obj[k] !== undefined && k !== "key" && k !== "Key" && k !== "controlField",
  );
  if (extraKeys.length > 0) return null;

  const controlField = readString(obj, "controlField", "ControlField");
  return controlField ? { key, controlField } : { key };
}

export function parseStepRunnerGetFromQkrpcData(
  data: unknown,
  input?: unknown,
): StepRunnerGetMeta | null {
  if (typeof data !== "object" || data === null) return null;
  const root = data as Record<string, unknown>;
  const action = readAction(root);
  if (action && action !== "step-runner-get") return null;

  const payload = unwrapPayload(data);
  if (!payload) return null;

  const success =
    readBool(payload, "success", "Success")
    ?? readBool(root, "ok", "success", "Success");
  if (success === false) return null;

  const inputParsed = parseStepRunnerGetInput(input);
  const { key: schemaKey, name } = extractSchemaInfo(payload);
  const key = inputParsed?.key ?? schemaKey;
  if (!key && !name) return null;

  return {
    key: key ?? "",
    name,
    controlField: inputParsed?.controlField,
  };
}

export function formatStepRunnerGetMetaLine(meta: StepRunnerGetMeta): string {
  const parts: string[] = [];
  if (meta.key) parts.push(meta.key);
  if (meta.name) parts.push(meta.name);
  if (meta.controlField) parts.push(`control: ${meta.controlField}`);
  return parts.join(" · ");
}

function readSearchControlField(
  row: Record<string, unknown>,
): StepRunnerSearchControlField | undefined {
  const nested = row.controlField ?? row.ControlField;
  if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
    const cf = nested as Record<string, unknown>;
    const key = readString(cf, "key", "Key");
    const value = readString(cf, "value", "Value");
    if (!key || !value) return undefined;
    const name = readString(cf, "name", "Name");
    return name ? { key, value, name } : { key, value };
  }
  const value = readString(row, "controlFieldValue", "ControlFieldValue");
  if (!value) return undefined;
  const key = readString(row, "controlFieldKey", "ControlFieldKey") ?? "type";
  const name = readString(row, "controlFieldName", "ControlFieldName");
  return name ? { key, value, name } : { key, value };
}

function normalizeSearchItemRow(raw: unknown): StepRunnerSearchItemRow | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const key = readString(row, "key", "Key");
  if (!key) return null;
  const name = readString(row, "name", "Name") ?? key;
  const description = readString(
    row,
    "description",
    "Description",
    "snippet",
    "Snippet",
  );
  const controlField = readSearchControlField(row);
  const base: StepRunnerSearchItemRow = description
    ? { key, name, description }
    : { key, name };
  return controlField ? { ...base, controlField } : base;
}

export function formatStepRunnerSearchControlField(
  cf: StepRunnerSearchControlField,
): string {
  const label = cf.name ? `${cf.name} (${cf.value})` : cf.value;
  return `${cf.key}=${label}`;
}

export function parseStepRunnerSearchResult(
  data: unknown,
  input?: unknown,
): StepRunnerSearchResult | null {
  const meta = parseStepRunnerSearchFromQkrpcData(data, input);
  if (!meta) return null;

  const payload = unwrapPayload(data);
  const rawItems = payload?.items ?? payload?.Items;
  const items = Array.isArray(rawItems)
    ? rawItems
        .map(normalizeSearchItemRow)
        .filter((row): row is StepRunnerSearchItemRow => row !== null)
    : [];

  const controlFieldItemCount = items.filter((r) => r.controlField).length;
  return { ...meta, items, controlFieldItemCount };
}

export function parseStepRunnerSearchFromQkrpcData(
  data: unknown,
  input?: unknown,
): StepRunnerSearchMeta | null {
  if (typeof data !== "object" || data === null) return null;
  const root = data as Record<string, unknown>;
  const action = readAction(root);
  if (action && action !== "step-runner-search") return null;

  const payload = unwrapPayload(data);
  if (!payload) return null;

  const success =
    readBool(payload, "success", "Success")
    ?? readBool(root, "ok", "success", "Success");
  if (success === false) return null;

  const items = payload.items ?? payload.Items;
  const matchCount =
    (Array.isArray(items) ? items.length : undefined)
    ?? readInt(payload, "matchCount", "MatchCount")
    ?? readInt(root, "matchCount", "MatchCount")
    ?? 0;

  let query: string | undefined;
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    query = readString(input as Record<string, unknown>, "query", "Query");
  }
  query ??= readString(payload, "query", "Query", "keyword", "Keyword");

  return { query, matchCount };
}

export function formatStepRunnerSearchMetaLine(
  meta: StepRunnerSearchMeta,
  options?: { controlFieldItemCount?: number },
): string {
  const parts: string[] = [];
  if (meta.query) parts.push(`「${meta.query}」`);
  parts.push(`${meta.matchCount} 个模块`);
  const cfCount = options?.controlFieldItemCount;
  if (cfCount !== undefined && cfCount > 0) {
    parts.push(`${cfCount} 含 controlField`);
  }
  return parts.join(" · ");
}

export function parseStepRunnerGetFromToolOutput(
  output: unknown,
  input?: unknown,
): StepRunnerGetMeta | null {
  if (!isStructuredToolResult(output) || !output.ok) return null;
  return parseStepRunnerGetFromQkrpcData(output.data, input);
}

export function parseStepRunnerSearchFromToolOutput(
  output: unknown,
  input?: unknown,
): StepRunnerSearchMeta | null {
  if (!isStructuredToolResult(output) || !output.ok) return null;
  return parseStepRunnerSearchFromQkrpcData(output.data, input);
}
