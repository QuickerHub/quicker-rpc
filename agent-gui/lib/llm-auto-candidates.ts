/** Ordered fallback models for Auto (NVIDIA NIM). First entry is the default. */
export const LLM_AUTO_MODEL_CANDIDATES = [
  "qwen/qwen3-coder-480b-a35b-instruct",
  "openai/gpt-oss-20b",
  "moonshotai/kimi-k2.6",
] as const;

export function mergeAutoModelCandidates(options: {
  primary?: string;
  configured?: readonly string[];
  defaults?: readonly string[];
  envModel?: string;
}): string[] {
  const defaults = options.defaults ?? LLM_AUTO_MODEL_CANDIDATES;
  const seeds = [
    options.envModel,
    options.primary,
    ...(options.configured ?? []),
    ...defaults,
  ];

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const raw of seeds) {
    const modelId = raw?.trim();
    if (!modelId || seen.has(modelId)) continue;
    seen.add(modelId);
    merged.push(modelId);
  }
  return merged;
}

export function reorderAutoModelCandidates(
  candidates: readonly string[],
  preferredModelId?: string,
): string[] {
  const preferred = preferredModelId?.trim();
  if (!preferred || candidates.length <= 1) return [...candidates];
  const index = candidates.indexOf(preferred);
  if (index <= 0) return [...candidates];
  const reordered = [...candidates];
  const [hit] = reordered.splice(index, 1);
  reordered.unshift(hit);
  return reordered;
}
