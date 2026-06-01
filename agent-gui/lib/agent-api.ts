import { fromJson, type JsonValue } from "@bufbuild/protobuf";
import {
  ActionSummaryItemSchema,
  SearchActionSummariesResultSchema,
  type ActionSummaryItem,
  type SearchActionSummariesResult,
} from "@/lib/gen/agent_api_pb";

export type { ActionSummaryItem, SearchActionSummariesResult };

/** Parse qkrpc tool `data` (ok/action/payload envelope or bare payload). */
export function parseSearchActionSummaries(
  data: unknown,
): SearchActionSummariesResult | null {
  const payload = unwrapPayload(data);
  if (payload === null) return null;
  try {
    return fromJson(SearchActionSummariesResultSchema, payload as JsonValue);
  } catch {
    // Old qkrpc JSON (e.g. non-RFC3339 timestamps) — caller uses raw payload fallback.
    return null;
  }
}

export function getActionSummaryItems(
  data: unknown,
): ActionSummaryItem[] {
  const parsed = parseSearchActionSummaries(data);
  return parsed?.items ?? [];
}

function unwrapPayload(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return null;
  const root = data as Record<string, unknown>;
  if (typeof root.payload === "object" && root.payload !== null) {
    return root.payload;
  }
  return root;
}
