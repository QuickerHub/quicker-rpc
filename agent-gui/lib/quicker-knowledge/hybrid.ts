import type { QuickerKnowledgeSearchResult } from "@/lib/quicker-knowledge/types";

export type ReciprocalRankFusionInput = {
  keyword: QuickerKnowledgeSearchResult[];
  vector: QuickerKnowledgeSearchResult[];
  limit?: number;
  k?: number;
};

type FusedResult = {
  result: QuickerKnowledgeSearchResult;
  score: number;
};

export function reciprocalRankFusion(
  input: ReciprocalRankFusionInput,
): QuickerKnowledgeSearchResult[] {
  const k = input.k ?? 60;
  const fusedByKey = new Map<string, FusedResult>();

  addRankedResults(fusedByKey, input.keyword, k, 1);
  addRankedResults(fusedByKey, input.vector, k, 1);

  return [...fusedByKey.values()]
    .map(({ result, score }) => ({ ...result, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, clampLimit(input.limit));
}

function addRankedResults(
  fusedByKey: Map<string, FusedResult>,
  results: QuickerKnowledgeSearchResult[],
  k: number,
  weight: number,
): void {
  results.forEach((result, index) => {
    const key = resultKey(result);
    const rank = index + 1;
    const fusedScore = weight / (k + rank);
    const existing = fusedByKey.get(key);

    if (existing == null) {
      fusedByKey.set(key, { result, score: fusedScore });
      return;
    }

    existing.score += fusedScore;
  });
}

function resultKey(result: QuickerKnowledgeSearchResult): string {
  return `${result.url}#${result.sectionPath.join("/")}`;
}

function clampLimit(limit = 6): number {
  if (!Number.isFinite(limit)) {
    return 6;
  }

  return Math.min(12, Math.max(1, Math.trunc(limit)));
}
