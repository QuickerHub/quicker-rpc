import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";

export type LlmUsageTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  requestCount: number;
};

export type LlmUsageSource =
  | "chat"
  | "title"
  | "compression";

export type LlmUsageEvent = {
  at: string;
  source: LlmUsageSource;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
};

export type LlmUsageIdentityKind = "quicker" | "device";

export type LlmUserUsageRecord = {
  version: 1;
  userId: string;
  identityKind?: LlmUsageIdentityKind;
  updatedAt: string;
  totals: LlmUsageTotals;
  byModel: Record<string, LlmUsageTotals>;
  recentEvents: LlmUsageEvent[];
};

const EMPTY_TOTALS = (): LlmUsageTotals => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  requestCount: 0,
});

const MAX_RECENT_EVENTS = 40;

export function resolveLlmUsageRoot(): string {
  return join(resolveAgentGuiRoot(), ".local", "llm-usage");
}

export function resolveLlmUsageUserPath(userId: string): string {
  const safe = userId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  return join(resolveLlmUsageRoot(), "users", `${safe}.json`);
}

function readUserRecord(path: string, userId: string): LlmUserUsageRecord {
  if (!existsSync(path)) {
    return {
      version: 1,
      userId,
      updatedAt: new Date(0).toISOString(),
      totals: EMPTY_TOTALS(),
      byModel: {},
      recentEvents: [],
    };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<LlmUserUsageRecord>;
    const identityKind = raw.identityKind === "device" ? "device" : "quicker";
    return {
      version: 1,
      userId: raw.userId?.trim() || userId,
      identityKind,
      updatedAt: raw.updatedAt ?? new Date(0).toISOString(),
      totals: normalizeTotals(raw.totals),
      byModel: normalizeByModel(raw.byModel),
      recentEvents: Array.isArray(raw.recentEvents)
        ? raw.recentEvents.map(normalizeEvent).filter(Boolean) as LlmUsageEvent[]
        : [],
    };
  } catch {
    return {
      version: 1,
      userId,
      updatedAt: new Date(0).toISOString(),
      totals: EMPTY_TOTALS(),
      byModel: {},
      recentEvents: [],
    };
  }
}

function normalizeTotals(raw: Partial<LlmUsageTotals> | undefined): LlmUsageTotals {
  return {
    inputTokens: nonNegativeInt(raw?.inputTokens),
    outputTokens: nonNegativeInt(raw?.outputTokens),
    totalTokens: nonNegativeInt(raw?.totalTokens),
    reasoningTokens: nonNegativeInt(raw?.reasoningTokens),
    requestCount: nonNegativeInt(raw?.requestCount),
  };
}

function normalizeByModel(
  raw: Record<string, Partial<LlmUsageTotals>> | undefined,
): Record<string, LlmUsageTotals> {
  if (!raw || typeof raw !== "object") return {};
  const next: Record<string, LlmUsageTotals> = {};
  for (const [modelId, totals] of Object.entries(raw)) {
    const key = modelId.trim();
    if (!key) continue;
    next[key] = normalizeTotals(totals);
  }
  return next;
}

function normalizeEvent(raw: unknown): LlmUsageEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Partial<LlmUsageEvent>;
  const source = data.source;
  if (source !== "chat" && source !== "title" && source !== "compression") {
    return null;
  }
  const modelId = data.modelId?.trim();
  if (!modelId) return null;
  const inputTokens = nonNegativeInt(data.inputTokens);
  const outputTokens = nonNegativeInt(data.outputTokens);
  const totalTokens = nonNegativeInt(data.totalTokens)
    || (inputTokens + outputTokens > 0 ? inputTokens + outputTokens : 0);
  return {
    at: data.at ?? new Date().toISOString(),
    source,
    modelId,
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens: nonNegativeInt(data.reasoningTokens),
  };
}

function nonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function addTotals(
  base: LlmUsageTotals,
  delta: Pick<
    LlmUsageTotals,
    "inputTokens" | "outputTokens" | "totalTokens" | "reasoningTokens"
  >,
): LlmUsageTotals {
  const inputTokens = base.inputTokens + delta.inputTokens;
  const outputTokens = base.outputTokens + delta.outputTokens;
  const reasoningTokens = base.reasoningTokens + delta.reasoningTokens;
  const totalTokens = base.totalTokens + (
    delta.totalTokens > 0
      ? delta.totalTokens
      : delta.inputTokens + delta.outputTokens
  );
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    requestCount: base.requestCount + 1,
  };
}

function writeUserRecord(path: string, record: LlmUserUsageRecord): void {
  const dir = join(path, "..");
  mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export type AppendLlmUsageInput = {
  userId: string;
  identityKind?: LlmUsageIdentityKind;
  modelId: string;
  source: LlmUsageSource;
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  reasoningTokens?: number;
  at?: string;
};

export function appendLlmUsage(input: AppendLlmUsageInput): LlmUserUsageRecord {
  const userId = input.userId.trim();
  const modelId = input.modelId.trim();
  const path = resolveLlmUsageUserPath(userId);
  const record = readUserRecord(path, userId);

  const delta = {
    inputTokens: nonNegativeInt(input.inputTokens),
    outputTokens: nonNegativeInt(input.outputTokens),
    totalTokens: nonNegativeInt(input.totalTokens),
    reasoningTokens: nonNegativeInt(input.reasoningTokens),
  };

  record.identityKind = input.identityKind ?? record.identityKind ?? "quicker";
  record.updatedAt = input.at ?? new Date().toISOString();
  record.totals = addTotals(record.totals, delta);
  record.byModel[modelId] = addTotals(
    record.byModel[modelId] ?? EMPTY_TOTALS(),
    delta,
  );

  const event: LlmUsageEvent = {
    at: record.updatedAt,
    source: input.source,
    modelId,
    inputTokens: delta.inputTokens,
    outputTokens: delta.outputTokens,
    totalTokens: delta.totalTokens > 0
      ? delta.totalTokens
      : delta.inputTokens + delta.outputTokens,
    reasoningTokens: delta.reasoningTokens,
  };
  record.recentEvents = [event, ...record.recentEvents].slice(0, MAX_RECENT_EVENTS);

  writeUserRecord(path, record);
  return record;
}

export function getLlmUsageForUser(userId: string): LlmUserUsageRecord | null {
  const trimmed = userId.trim();
  if (!trimmed) return null;
  const path = resolveLlmUsageUserPath(trimmed);
  if (!existsSync(path)) return null;
  return readUserRecord(path, trimmed);
}
