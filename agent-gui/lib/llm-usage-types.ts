/** Client-safe types for GET /api/llm/usage. */

export type LlmUsageIdentityKind = "quicker" | "device";

export type LlmUsageTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  requestCount: number;
};

export type LlmUsageSource = "chat" | "title" | "compression";

export type LlmUsageEvent = {
  at: string;
  source: LlmUsageSource;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
};

export type LlmUserUsageRecord = {
  version: 1;
  userId: string;
  identityKind?: LlmUsageIdentityKind;
  updatedAt: string;
  totals: LlmUsageTotals;
  byModel: Record<string, LlmUsageTotals>;
  recentEvents: LlmUsageEvent[];
};

export type QuickerAccountSnapshot = {
  loggedIn: boolean;
  userId?: string;
  userName?: string;
  nickName?: string;
  message?: string;
};

export type LlmUsageIdentity = {
  kind: LlmUsageIdentityKind;
  id: string;
  storageKey: string;
};

export type LlmUsageApiResponse = {
  ok: boolean;
  account: QuickerAccountSnapshot;
  identity: LlmUsageIdentity;
  tracked: boolean;
  usage: LlmUserUsageRecord | null;
  error?: string;
};
