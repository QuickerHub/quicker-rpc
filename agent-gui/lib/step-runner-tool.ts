import { isStructuredToolResult } from "./tool-result";
import type { StepRunnerSchemaReadRequest } from "./step-runner-schema-read";

export type StepRunnerGetMeta = {
  key: string;
  name?: string;
  controlField?: string;
  docReference?: { topic: string; file: string; tier?: string };
};

export type StepRunnerSearchMeta = {
  query?: string;
  matchCount: number;
};

export type StepRunnerSearchControlField = {
  key: string;
  value: string;
  name?: string;
  visibleInputKeys?: string[];
  visibleOutputKeys?: string[];
};

export type StepRunnerSearchItemRow = {
  key: string;
  name: string;
  description?: string;
  controlField?: StepRunnerSearchControlField;
  /** OR (|) query: multiple matching control modes on one module. */
  controlFields?: StepRunnerSearchControlField[];
  inputParamKeys?: string[];
  outputParamKeys?: string[];
};

export type StepRunnerSearchResult = StepRunnerSearchMeta & {
  items: StepRunnerSearchItemRow[];
  controlFieldItemCount?: number;
  /** Items with controlFields[] (OR query). */
  multiControlFieldCount?: number;
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

function readLiteral(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) if (typeof obj[key] === "string") return obj[key] as string;
  return undefined;
}

function readStringList(obj: Record<string, unknown>, ...keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (!Array.isArray(value)) continue;
    const list = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (list.length > 0) return list;
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
  docReference?: StepRunnerGetMeta["docReference"];
} {
  const schemaJson = payload.schemaJson ?? payload.SchemaJson;
  if (typeof schemaJson === "string" && schemaJson.trim()) {
    try {
      const parsed = JSON.parse(schemaJson) as Record<string, unknown>;
      return {
        key: readString(parsed, "StepRunnerKey", "stepRunnerKey"),
        name: readString(parsed, "Name", "name"),
        docReference: readDocReference(parsed.docReference ?? parsed.DocReference),
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
      docReference: readDocReference(s.docReference ?? s.DocReference),
    };
  }

  return {};
}

function readDocReference(raw: unknown): StepRunnerGetMeta["docReference"] | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const topic = readString(obj, "topic", "Topic") ?? "step-modules";
  const file = readString(obj, "file", "File");
  if (!file) return undefined;
  const tier = readString(obj, "tier", "Tier");
  return tier ? { topic, file, tier } : { topic, file };
}

export function parseStepRunnerGetInput(
  input: unknown,
): { key: string; controlField?: string; read?: StepRunnerSchemaReadRequest } | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const obj = input as Record<string, unknown>;
  const key = readString(obj, "key", "Key", "runnerKey", "RunnerKey");
  if (!key) return null;

  const extraKeys = Object.keys(obj).filter(
    (k) =>
      obj[k] !== undefined
      && k !== "key"
      && k !== "Key"
      && k !== "runnerKey"
      && k !== "RunnerKey"
      && k !== "controlField"
      && k !== "ControlField"
      && k !== "read",
  );
  if (extraKeys.length > 0) return null;

  let read: StepRunnerSchemaReadRequest | undefined;
  if (obj.read !== undefined) {
    if (!obj.read || typeof obj.read !== "object" || Array.isArray(obj.read)) return null;
    const value = obj.read as Record<string, unknown>;
    if (Object.keys(value).some(k => !["pointer", "mode", "offset", "expectedObservation"].includes(k))
      || (value.pointer !== undefined && typeof value.pointer !== "string")
      || (value.mode !== undefined && value.mode !== "children" && value.mode !== "value")
      || (value.offset !== undefined && (typeof value.offset !== "number" || !Number.isInteger(value.offset) || value.offset < 0 || value.offset > 2147483647))
      || (value.expectedObservation !== undefined && typeof value.expectedObservation !== "string")) return null;
    read = value as StepRunnerSchemaReadRequest;
  }
  const controlField = readLiteral(obj, "controlField", "ControlField");
  return { key, ...(controlField !== undefined ? { controlField } : {}), ...(read ? { read } : {}) };
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
  const { key: schemaKey, name, docReference } = extractSchemaInfo(payload);
  const key = inputParsed?.key ?? schemaKey;
  if (!key && !name) return null;

  return {
    key: key ?? "",
    name,
    controlField: inputParsed?.controlField,
    docReference,
  };
}

export function formatStepRunnerGetMetaLine(meta: StepRunnerGetMeta): string {
  const parts: string[] = [];
  if (meta.key) parts.push(meta.key);
  if (meta.name) parts.push(meta.name);
  if (meta.controlField !== undefined) parts.push(`control: ${JSON.stringify(meta.controlField)}`);
  if (meta.docReference) {
    parts.push(`doc: ${meta.docReference.topic}/${meta.docReference.file}`);
  }
  return parts.join(" · ");
}

function readSearchControlFieldFromObject(
  nested: Record<string, unknown>,
): StepRunnerSearchControlField | undefined {
  const key = readString(nested, "key", "Key");
  const value = readLiteral(nested, "value", "Value");
  if (!key || value === undefined) return undefined;
  const name = readString(nested, "name", "Name");
  const visibleInputKeys = readStringList(
    nested,
    "visibleInputKeys",
    "VisibleInputKeys",
  );
  const visibleOutputKeys = readStringList(
    nested,
    "visibleOutputKeys",
    "VisibleOutputKeys",
  );
  return {
    key,
    value,
    ...(name ? { name } : {}),
    ...(visibleInputKeys ? { visibleInputKeys } : {}),
    ...(visibleOutputKeys ? { visibleOutputKeys } : {}),
  };
}

function readSearchControlFields(
  row: Record<string, unknown>,
): StepRunnerSearchControlField[] | undefined {
  const nested = row.controlFields ?? row.ControlFields;
  if (!Array.isArray(nested) || nested.length <= 1) {
    return undefined;
  }
  const list = nested
    .map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        return null;
      }
      return readSearchControlFieldFromObject(item as Record<string, unknown>);
    })
    .filter((cf): cf is StepRunnerSearchControlField => cf !== null);
  return list.length > 1 ? list : undefined;
}

function readSearchControlField(
  row: Record<string, unknown>,
): StepRunnerSearchControlField | undefined {
  const multi = readSearchControlFields(row);
  if (multi?.[0]) {
    return multi[0];
  }

  const nested = row.controlField ?? row.ControlField;
  if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
    return readSearchControlFieldFromObject(nested as Record<string, unknown>);
  }
  const value = readLiteral(row, "controlFieldValue", "ControlFieldValue");
  if (value === undefined) return undefined;
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
  const controlFields = readSearchControlFields(row);
  const controlField = readSearchControlField(row);
  const inputParamKeys = readStringList(row, "inputParamKeys", "InputParamKeys");
  const outputParamKeys = readStringList(row, "outputParamKeys", "OutputParamKeys");
  const base: StepRunnerSearchItemRow = description
    ? { key, name, description }
    : { key, name };
  const withKeys = {
    ...base,
    ...(inputParamKeys ? { inputParamKeys } : {}),
    ...(outputParamKeys ? { outputParamKeys } : {}),
  };
  if (controlFields) {
    return controlField
      ? { ...withKeys, controlField, controlFields }
      : { ...withKeys, controlFields };
  }
  return controlField ? { ...withKeys, controlField } : withKeys;
}

export function formatStepRunnerSearchControlField(
  cf: StepRunnerSearchControlField,
): string {
  const label = cf.name ? `${cf.name} (${cf.value})` : cf.value;
  const parts = [`${cf.key}=${label}`];
  if (cf.visibleInputKeys?.length) {
    parts.push(`in: ${cf.visibleInputKeys.join(", ")}`);
  }
  if (cf.visibleOutputKeys?.length) {
    parts.push(`out: ${cf.visibleOutputKeys.join(", ")}`);
  }
  return parts.join(" · ");
}

function formatParamKeyHint(row: StepRunnerSearchItemRow): string | undefined {
  const inputKeys =
    row.controlField?.visibleInputKeys
    ?? row.inputParamKeys;
  const outputKeys =
    row.controlField?.visibleOutputKeys
    ?? row.outputParamKeys;
  const parts: string[] = [];
  if (inputKeys?.length) parts.push(`in: ${inputKeys.join(", ")}`);
  if (outputKeys?.length) parts.push(`out: ${outputKeys.join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Build qkrpc_step_runner_get input from a search hit. */
export function buildStepRunnerGetInputFromSearchItem(
  row: StepRunnerSearchItemRow,
): { key: string; controlField?: string } {
  const input: { key: string; controlField?: string } = { key: row.key };
  if (row.controlField?.value !== undefined) {
    input.controlField = row.controlField.value;
  }
  return input;
}

/** One search hit: module key + optional controlField(s). */
export function formatStepRunnerSearchItemHitLine(
  row: StepRunnerSearchItemRow,
): string {
  const parts: string[] = [row.key];
  if (row.name && row.name !== row.key) {
    parts.push(row.name);
  }
  if (row.controlFields && row.controlFields.length > 1) {
    parts.push(
      row.controlFields
        .map((cf) => formatStepRunnerSearchControlField(cf))
        .join(", "),
    );
  } else if (row.controlField) {
    parts.push(formatStepRunnerSearchControlField(row.controlField));
  } else {
    const keyHint = formatParamKeyHint(row);
    if (keyHint) parts.push(keyHint);
  }
  return parts.join(" · ");
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

  const controlFieldItemCount = items.filter(
    (r) => r.controlField || (r.controlFields?.length ?? 0) > 0,
  ).length;
  const multiControlFieldCount = items.filter(
    (r) => (r.controlFields?.length ?? 0) > 1,
  ).length;
  return { ...meta, items, controlFieldItemCount, multiControlFieldCount };
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
  options?: {
    items?: StepRunnerSearchItemRow[];
    controlFieldItemCount?: number;
    multiControlFieldCount?: number;
  },
): string {
  const parts: string[] = [];
  if (meta.query) parts.push(`「${meta.query}」`);

  const items = options?.items ?? [];
  if (meta.matchCount === 1 && items.length === 1) {
    parts.push(formatStepRunnerSearchItemHitLine(items[0]));
    return parts.join(" · ");
  }

  parts.push(`${meta.matchCount} 个模块`);

  const withControl = items.filter(
    (r) => r.controlField || (r.controlFields?.length ?? 0) > 0,
  );
  if (withControl.length > 0 && withControl.length <= 3) {
    for (const row of withControl) {
      parts.push(formatStepRunnerSearchItemHitLine(row));
    }
  } else {
    const cfCount = options?.controlFieldItemCount;
    if (cfCount !== undefined && cfCount > 0) {
      parts.push(`${cfCount} 含 controlField`);
    }
  }

  const multi = options?.multiControlFieldCount;
  if (multi !== undefined && multi > 0) {
    parts.push(`${multi} 多 control`);
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
