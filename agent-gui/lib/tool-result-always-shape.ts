import {
  normalizeGrepMatchesByPath,
} from "@/lib/search-match-grouping";
import {
  parseStepRunnerSearchResult,
  type StepRunnerSearchItemRow,
} from "@/lib/step-runner-tool";
import {
  isStructuredToolResult,
  type StructuredToolResult,
} from "@/lib/tool-result";
import { GREP_TOOL } from "@/lib/host-tool-constants";

export const STEP_RUNNER_SEARCH_DESC_MAX_CHARS = 160;
export const STEP_RUNNER_GET_SCHEMA_SOFT_CHARS = 6_000;

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function unwrapQkrpcPayload(data: Record<string, unknown>): Record<string, unknown> {
  const payload = readRecord(data.payload);
  return payload ?? data;
}

export function slimStepRunnerSearchItem(
  row: StepRunnerSearchItemRow,
): StepRunnerSearchItemRow {
  if (!row.description || row.description.length <= STEP_RUNNER_SEARCH_DESC_MAX_CHARS) {
    return row;
  }
  return {
    ...row,
    description: `${row.description.slice(0, STEP_RUNNER_SEARCH_DESC_MAX_CHARS)}…`,
  };
}

/** Structural slimming safe to apply every turn (no displayData split). */
export function shapeGrepToolResult(result: StructuredToolResult): StructuredToolResult {
  const data = readRecord(result.data);
  if (!data || data.success === false || !Array.isArray(data.matches)) return result;
  if (data.outputMode && data.outputMode !== "content") return result;

  const rawMatches = data.matches as unknown[];
  const normalized = normalizeGrepMatchesByPath(rawMatches);
  if (JSON.stringify(normalized) === JSON.stringify(rawMatches)) return result;

  return {
    ...result,
    data: { ...data, matches: normalized },
  };
}

export function shapeStepRunnerSearchResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  const parsed = parseStepRunnerSearchResult(result.data, input);
  if (!parsed) return result;

  const slimItems = parsed.items.map(slimStepRunnerSearchItem);
  if (JSON.stringify(slimItems) === JSON.stringify(parsed.items)) return result;

  const data = readRecord(result.data);
  if (!data) return result;
  const payload = unwrapQkrpcPayload(data);
  const nextPayload = {
    ...payload,
    items: slimItems,
    matchCount: parsed.matchCount,
  };

  return {
    ...result,
    data: readRecord(data.payload)
      ? { ...data, payload: nextPayload }
      : { ...data, ...nextPayload },
  };
}

function extractInputParamKeys(schemaJson: string): string[] | undefined {
  try {
    const parsed = JSON.parse(schemaJson) as Record<string, unknown>;
    const inputs = parsed.inputParams ?? parsed.InputParams;
    if (!Array.isArray(inputs)) return undefined;
    const keys: string[] = [];
    for (const item of inputs) {
      const row = readRecord(item);
      const key = row ? readString(row.key) ?? readString(row.Key) : undefined;
      if (key) keys.push(key);
    }
    return keys.length > 0 ? keys : undefined;
  } catch {
    return undefined;
  }
}

/** Trim oversized step_runner_get schemaJson when compression is active. */
export function shapeStepRunnerGetResult(
  result: StructuredToolResult,
): StructuredToolResult {
  const data = readRecord(result.data);
  if (!data) return result;

  const payload = unwrapQkrpcPayload(data);
  const schemaJson = readString(payload.schemaJson) ?? readString(payload.SchemaJson);
  if (!schemaJson || schemaJson.length <= STEP_RUNNER_GET_SCHEMA_SOFT_CHARS) return result;

  const inputParamKeys = extractInputParamKeys(schemaJson);
  const nextPayload: Record<string, unknown> = {
    ...payload,
    schemaJsonOmitted: true,
    schemaJsonChars: schemaJson.length,
    ...(inputParamKeys ? { inputParamKeys } : {}),
    readHint: "Full schema omitted from agent payload — repeat qkrpc_step_runner_get or use displayData in UI.",
  };
  delete nextPayload.schemaJson;
  delete nextPayload.SchemaJson;

  return {
    ...result,
    data: readRecord(data.payload)
      ? { ...data, payload: nextPayload }
      : { ...data, ...nextPayload },
  };
}

/** Always-on structural shaping (grouping, snippet trim) before optional compression. */
export function applyAlwaysOnToolResultShape(
  toolName: string,
  input: unknown,
  result: Record<string, unknown>,
): Record<string, unknown> {
  if (!isStructuredToolResult(result)) return result;

  if (toolName === GREP_TOOL) {
    return shapeGrepToolResult(result);
  }
  if (toolName === "qkrpc_step_runner_search") {
    return shapeStepRunnerSearchResult(input, result);
  }
  return result;
}
