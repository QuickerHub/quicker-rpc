export type LauncherCachedToolStep = {
  toolName: string;
  input: Record<string, unknown>;
};

export type LauncherCommandCacheEntry = {
  id: string;
  trigger: string;
  aliases?: string[];
  steps: LauncherCachedToolStep[];
  note?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  useCount: number;
};

export const LAUNCHER_COMMAND_CACHE_MAX_MATCHES = 8;
export const LAUNCHER_COMMAND_CACHE_MIN_SCORE = 55;

/** Normalize user phrases for fuzzy matching (Chinese-friendly). */
export function normalizeLauncherCommandPhrase(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/<qka\b[^>]*>[\s\S]*?<\/qka>/gi, " ")
    .replace(/[。，！？、；：「」『』（）【】\s,.!?;:'"()[\]{}<>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizePhrase(text: string): string[] {
  const normalized = normalizeLauncherCommandPhrase(text);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

export type LauncherCommandCacheMatch = {
  entry: LauncherCommandCacheEntry;
  score: number;
};

export function scoreLauncherCommandMatch(
  userText: string,
  entry: LauncherCommandCacheEntry,
): number {
  const userNorm = normalizeLauncherCommandPhrase(userText);
  if (!userNorm) return 0;

  const phrases = [entry.trigger, ...(entry.aliases ?? [])];
  let best = 0;

  for (const phrase of phrases) {
    const phraseNorm = normalizeLauncherCommandPhrase(phrase);
    if (!phraseNorm) continue;

    if (userNorm === phraseNorm) {
      best = Math.max(best, 100);
      continue;
    }
    if (userNorm.includes(phraseNorm) || phraseNorm.includes(userNorm)) {
      best = Math.max(best, 85);
      continue;
    }

    const userTokens = tokenizePhrase(userNorm);
    const phraseTokens = tokenizePhrase(phraseNorm);
    if (userTokens.length === 0 || phraseTokens.length === 0) continue;

    const phraseSet = new Set(phraseTokens);
    const matched = userTokens.filter((token) => phraseSet.has(token)).length;
    if (matched === phraseTokens.length) {
      best = Math.max(best, 70);
      continue;
    }

    const ratio =
      matched / Math.max(userTokens.length, phraseTokens.length);
    if (ratio >= 0.6) {
      best = Math.max(best, Math.round(40 + ratio * 40));
    }
  }

  return best;
}

export function matchLauncherCommandCacheEntries(
  userText: string,
  entries: LauncherCommandCacheEntry[],
): LauncherCommandCacheMatch[] {
  const trimmed = userText.trim();
  if (!trimmed) return [];

  return entries
    .map((entry) => ({
      entry,
      score: scoreLauncherCommandMatch(trimmed, entry),
    }))
    .filter((item) => item.score >= LAUNCHER_COMMAND_CACHE_MIN_SCORE)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.entry.useCount ?? 0) - (a.entry.useCount ?? 0);
    })
    .slice(0, LAUNCHER_COMMAND_CACHE_MAX_MATCHES);
}

/** Exact phrase match (trigger or alias) — eligible for zero-LLM direct execution. */
export function findDirectLauncherCacheMatch(
  userText: string,
  entries: LauncherCommandCacheEntry[],
): LauncherCommandCacheEntry | undefined {
  const trimmed = userText.trim();
  if (!trimmed) return undefined;
  const userNorm = normalizeLauncherCommandPhrase(trimmed);
  if (!userNorm) return undefined;

  for (const entry of entries) {
    const phrases = [entry.trigger, ...(entry.aliases ?? [])];
    for (const phrase of phrases) {
      if (normalizeLauncherCommandPhrase(phrase) === userNorm) {
        return entry;
      }
    }
  }
  return undefined;
}

function formatStepForPrompt(step: LauncherCachedToolStep): string {
  return `- ${step.toolName}(${JSON.stringify(step.input)})`;
}

export function formatLauncherCommandCachePromptBlock(
  matches: LauncherCommandCacheMatch[],
): string | undefined {
  if (matches.length === 0) return undefined;

  const lines = [
    "## Cached launcher commands (high priority when user intent matches)",
    "When the user's message matches a trigger below, execute the listed tool calls directly in order with the same arguments. Skip docs/search re-planning unless a step fails.",
    "",
  ];

  matches.forEach(({ entry, score }, index) => {
    lines.push(
      `${index + 1}. Trigger: "${entry.trigger}" (match ${score}%, used ${entry.useCount}×)`,
    );
    if (entry.note) {
      lines.push(`   Note: ${entry.note}`);
    }
    lines.push("   Steps:");
    for (const step of entry.steps) {
      lines.push(`   ${formatStepForPrompt(step)}`);
    }
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}
