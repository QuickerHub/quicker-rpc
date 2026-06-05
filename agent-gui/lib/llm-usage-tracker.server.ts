import { shouldTrackManagedLlmUsage } from "@/lib/llm-managed-usage";
import {
  appendLlmUsage,
  getLlmUsageForUser,
  type LlmUsageSource,
  type LlmUserUsageRecord,
} from "@/lib/llm-usage-store.server";
import type { LlmSelection } from "@/lib/llm-selection";
import {
  resolveLlmUsageIdentity,
  type LlmUsageIdentity,
} from "@/lib/llm-usage-identity.server";
import type { QuickerAccountSnapshot } from "@/lib/quicker-account.server";

export type LlmUsageSnapshot = {
  account: QuickerAccountSnapshot;
  identity: LlmUsageIdentity;
  tracked: boolean;
  usage: LlmUserUsageRecord | null;
};

export type RecordManagedLlmUsageInput = {
  selection: LlmSelection;
  modelId: string;
  source: LlmUsageSource;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
};

function normalizeUsageCounts(input: RecordManagedLlmUsageInput): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
} | null {
  const inputTokens = Math.max(0, Math.trunc(input.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.trunc(input.outputTokens ?? 0));
  const reasoningTokens = Math.max(0, Math.trunc(input.reasoningTokens ?? 0));
  const totalTokens = Math.max(
    0,
    Math.trunc(
      input.totalTokens
      ?? (inputTokens + outputTokens > 0 ? inputTokens + outputTokens : 0),
    ),
  );
  if (inputTokens + outputTokens + totalTokens + reasoningTokens <= 0) {
    return null;
  }
  return { inputTokens, outputTokens, totalTokens, reasoningTokens };
}

export async function getManagedLlmUsageSnapshot(options?: {
  forceRefreshAccount?: boolean;
}): Promise<LlmUsageSnapshot> {
  const { account, identity } = await resolveLlmUsageIdentity({
    forceRefreshAccount: options?.forceRefreshAccount,
  });
  const usage = getLlmUsageForUser(identity.storageKey);
  return {
    account,
    identity,
    tracked: true,
    usage,
  };
}

export async function recordManagedLlmUsage(
  input: RecordManagedLlmUsageInput,
): Promise<LlmUserUsageRecord | null> {
  if (!shouldTrackManagedLlmUsage(input.selection)) {
    return null;
  }

  const counts = normalizeUsageCounts(input);
  if (!counts) return null;

  const { identity } = await resolveLlmUsageIdentity();

  return appendLlmUsage({
    userId: identity.storageKey,
    identityKind: identity.kind,
    modelId: input.modelId,
    source: input.source,
    inputTokens: counts.inputTokens,
    outputTokens: counts.outputTokens,
    totalTokens: counts.totalTokens,
    reasoningTokens: counts.reasoningTokens,
  });
}

/** Fire-and-forget wrapper for hot request paths. */
export function recordManagedLlmUsageAsync(
  input: RecordManagedLlmUsageInput,
): void {
  void recordManagedLlmUsage(input).catch((error) => {
    console.warn("[llm-usage] record failed:", error);
  });
}
