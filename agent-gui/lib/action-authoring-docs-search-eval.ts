import type { AuthoringDocSearchHit } from "@/lib/action-authoring-docs-search";
import { authoringDocRowId } from "@/lib/action-authoring-docs-search";
import evalCases from "@/lib/action-authoring-docs-search-eval.json";

export type DocsSearchEvalDocRef = {
  topic: string;
  reference?: string;
};

export type DocsSearchEvalExpect = {
  top?: DocsSearchEvalDocRef;
  inTopK?: DocsSearchEvalDocRef[];
  notInTopK?: DocsSearchEvalDocRef[];
  minHits?: number;
  maxHits?: number;
};

export type DocsSearchEvalCase = {
  id: string;
  category: string;
  query: string;
  k?: number;
  expect: DocsSearchEvalExpect;
  knownIssue?: string;
  note?: string;
};

export type DocsSearchEvalDataset = {
  version: number;
  description?: string;
  defaultK: number;
  cases: DocsSearchEvalCase[];
};

export type DocsSearchEvalHitView = {
  rank: number;
  id: string;
  topic: string;
  reference?: string;
  title: string;
  score: number;
};

export type DocsSearchEvalCaseResult = {
  id: string;
  category: string;
  query: string;
  k: number;
  passed: boolean;
  knownIssue?: string;
  knownIssueResolved?: boolean;
  reciprocalRank: number | null;
  top1Hit: boolean;
  recallAtKHit: boolean;
  failures: string[];
  actualTop: DocsSearchEvalHitView[];
};

export type DocsSearchEvalCategoryMetrics = {
  total: number;
  passed: number;
  top1: number;
  mrr: number;
  recallAtK: number;
};

export type DocsSearchEvalSummary = {
  corpusSize?: number;
  total: number;
  passed: number;
  failed: number;
  knownIssueFailed: number;
  knownIssueResolved: number;
  blockingFailed: number;
  metrics: {
    top1: number;
    mrr: number;
    recallAtK: number;
  };
  byCategory: Record<string, DocsSearchEvalCategoryMetrics>;
  caseResults: DocsSearchEvalCaseResult[];
};

export type DocsSearchEvalThresholds = {
  minTop1?: number;
  minMrr?: number;
  minRecallAtK?: number;
  maxBlockingFailed?: number;
};

export const DEFAULT_EVAL_DATASET = evalCases as DocsSearchEvalDataset;

export const DEFAULT_EVAL_THRESHOLDS: Required<DocsSearchEvalThresholds> = {
  minTop1: 0.85,
  minMrr: 0.82,
  minRecallAtK: 0.9,
  maxBlockingFailed: 0,
};

export function docRefKey(ref: DocsSearchEvalDocRef): string {
  return ref.reference ? `${ref.topic}/${ref.reference}` : ref.topic;
}

export function hitMatchesDocRef(
  hit: AuthoringDocSearchHit,
  ref: DocsSearchEvalDocRef,
): boolean {
  if (hit.row.topic !== ref.topic) return false;
  if (ref.reference) return hit.row.reference === ref.reference;
  return !hit.row.reference;
}

export function findRankForAnyRef(
  hits: AuthoringDocSearchHit[],
  refs: DocsSearchEvalDocRef[],
): number | null {
  for (let i = 0; i < hits.length; i++) {
    if (refs.some((ref) => hitMatchesDocRef(hits[i], ref))) {
      return i + 1;
    }
  }
  return null;
}

function toHitView(
  hit: AuthoringDocSearchHit,
  rank: number,
): DocsSearchEvalHitView {
  return {
    rank,
    id: authoringDocRowId(hit.row),
    topic: hit.row.topic,
    reference: hit.row.reference,
    title: hit.row.title,
    score: hit.score,
  };
}

function primaryTargets(expect: DocsSearchEvalExpect): DocsSearchEvalDocRef[] {
  if (expect.top) return [expect.top];
  if (expect.inTopK?.length) return expect.inTopK;
  return [];
}

export function evaluateDocsSearchCase(
  testCase: DocsSearchEvalCase,
  hits: AuthoringDocSearchHit[],
  defaultK: number,
): DocsSearchEvalCaseResult {
  const k = testCase.k ?? defaultK;
  const topHits = hits.slice(0, k);
  const failures: string[] = [];
  const expect = testCase.expect;

  if (expect.minHits != null && hits.length < expect.minHits) {
    failures.push(
      `expected at least ${expect.minHits} hits, got ${hits.length}`,
    );
  }
  if (expect.maxHits != null && hits.length > expect.maxHits) {
    failures.push(
      `expected at most ${expect.maxHits} hits, got ${hits.length}`,
    );
  }

  if (expect.top) {
    const top = topHits[0];
    if (!top || !hitMatchesDocRef(top, expect.top)) {
      const got = top
        ? docRefKey({ topic: top.row.topic, reference: top.row.reference })
        : "(none)";
      failures.push(
        `expected top ${docRefKey(expect.top)}, got ${got}`,
      );
    }
  }

  if (expect.inTopK?.length) {
    const rank = findRankForAnyRef(topHits, expect.inTopK);
    if (rank == null) {
      failures.push(
        `expected one of [${expect.inTopK.map(docRefKey).join(", ")}] in top ${k}`,
      );
    }
  }

  if (expect.notInTopK?.length) {
    for (const banned of expect.notInTopK) {
      const rank = findRankForAnyRef(topHits, [banned]);
      if (rank != null) {
        failures.push(
          `expected ${docRefKey(banned)} absent from top ${k}, found at rank ${rank}`,
        );
      }
    }
  }

  const targets = primaryTargets(expect);
  const rank = targets.length > 0 ? findRankForAnyRef(topHits, targets) : null;
  const reciprocalRank = rank != null ? 1 / rank : null;
  const top1Hit = expect.top
    ? Boolean(topHits[0] && hitMatchesDocRef(topHits[0], expect.top))
    : rank === 1;
  const recallAtKHit = expect.inTopK
    ? findRankForAnyRef(topHits, expect.inTopK) != null
    : rank != null;

  const passed = failures.length === 0;
  const knownIssueResolved = Boolean(testCase.knownIssue && passed);

  return {
    id: testCase.id,
    category: testCase.category,
    query: testCase.query,
    k,
    passed,
    knownIssue: testCase.knownIssue,
    knownIssueResolved,
    reciprocalRank,
    top1Hit,
    recallAtKHit,
    failures,
    actualTop: topHits
      .slice(0, Math.min(k, 10))
      .map((hit, index) => toHitView(hit, index + 1)),
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function summarizeDocsSearchEval(
  caseResults: DocsSearchEvalCaseResult[],
): Omit<DocsSearchEvalSummary, "corpusSize" | "caseResults"> {
  const blockingCases = caseResults.filter((r) => !r.knownIssue);
  const scored = blockingCases.filter((r) => r.reciprocalRank != null);
  const recallCases = blockingCases.filter(
    (r) => r.recallAtKHit || r.reciprocalRank != null,
  );
  const knownIssueFailed = caseResults.filter(
    (r) => r.knownIssue && !r.passed,
  ).length;
  const knownIssueResolved = caseResults.filter(
    (r) => r.knownIssueResolved,
  ).length;
  const blockingFailed = caseResults.filter(
    (r) => !r.passed && !r.knownIssue,
  ).length;

  const byCategory: Record<string, DocsSearchEvalCategoryMetrics> = {};
  for (const result of caseResults) {
    const bucket = byCategory[result.category] ?? {
      total: 0,
      passed: 0,
      top1: 0,
      mrr: 0,
      recallAtK: 0,
    };
    bucket.total += 1;
    if (result.passed) bucket.passed += 1;
    if (result.top1Hit) bucket.top1 += 1;
    if (result.reciprocalRank != null) {
      bucket.mrr += result.reciprocalRank;
    }
    if (result.recallAtKHit) bucket.recallAtK += 1;
    byCategory[result.category] = bucket;
  }

  for (const category of Object.keys(byCategory)) {
    const bucket = byCategory[category];
    bucket.mrr = bucket.total > 0 ? bucket.mrr / bucket.total : 0;
    bucket.recallAtK = bucket.total > 0 ? bucket.recallAtK / bucket.total : 0;
    bucket.top1 = bucket.total > 0 ? bucket.top1 / bucket.total : 0;
  }

  return {
    total: caseResults.length,
    passed: caseResults.filter((r) => r.passed).length,
    failed: caseResults.filter((r) => !r.passed).length,
    knownIssueFailed,
    knownIssueResolved,
    blockingFailed,
    metrics: {
      top1: average(blockingCases.map((r) => (r.top1Hit ? 1 : 0))),
      mrr: average(scored.map((r) => r.reciprocalRank ?? 0)),
      recallAtK: average(recallCases.map((r) => (r.recallAtKHit ? 1 : 0))),
    },
    byCategory,
  };
}

export function evaluateDocsSearchDataset(input: {
  dataset?: DocsSearchEvalDataset;
  search: (query: string, limit: number) => AuthoringDocSearchHit[];
  categories?: string[];
}): DocsSearchEvalSummary {
  const dataset = input.dataset ?? DEFAULT_EVAL_DATASET;
  const defaultK = dataset.defaultK ?? 5;
  const cases = input.categories?.length
    ? dataset.cases.filter((c) => input.categories!.includes(c.category))
    : dataset.cases;

  const caseResults = cases.map((testCase) => {
    const limit = Math.max(testCase.k ?? defaultK, defaultK, 10);
    const hits = input.search(testCase.query, limit);
    return evaluateDocsSearchCase(testCase, hits, defaultK);
  });

  return {
    ...summarizeDocsSearchEval(caseResults),
    caseResults,
  };
}

export function runDocsSearchEval(
  search: (query: string, limit: number) => AuthoringDocSearchHit[],
  options?: {
    dataset?: DocsSearchEvalDataset;
    categories?: string[];
    corpusSize?: number;
  },
): DocsSearchEvalSummary {
  const summary = evaluateDocsSearchDataset({
    dataset: options?.dataset,
    categories: options?.categories,
    search,
  });
  if (options?.corpusSize != null) {
    summary.corpusSize = options.corpusSize;
  }
  return summary;
}

export function assertDocsSearchEvalThresholds(
  summary: DocsSearchEvalSummary,
  thresholds: DocsSearchEvalThresholds = DEFAULT_EVAL_THRESHOLDS,
): string[] {
  const merged = { ...DEFAULT_EVAL_THRESHOLDS, ...thresholds };
  const errors: string[] = [];

  if (summary.metrics.top1 < merged.minTop1) {
    errors.push(
      `Top@1 ${summary.metrics.top1.toFixed(3)} < ${merged.minTop1}`,
    );
  }
  if (summary.metrics.mrr < merged.minMrr) {
    errors.push(`MRR ${summary.metrics.mrr.toFixed(3)} < ${merged.minMrr}`);
  }
  if (summary.metrics.recallAtK < merged.minRecallAtK) {
    errors.push(
      `Recall@K ${summary.metrics.recallAtK.toFixed(3)} < ${merged.minRecallAtK}`,
    );
  }
  if (summary.blockingFailed > merged.maxBlockingFailed) {
    errors.push(
      `blocking failures ${summary.blockingFailed} > ${merged.maxBlockingFailed}`,
    );
  }

  return errors;
}

export function formatDocsSearchEvalReport(
  summary: DocsSearchEvalSummary,
  options?: { verbose?: boolean; failuresOnly?: boolean },
): string {
  const lines: string[] = [];
  lines.push("Docs search relevance eval");
  if (summary.corpusSize != null) {
    lines.push(`Corpus: ${summary.corpusSize} documents`);
  }
  lines.push(
    `Cases: ${summary.total} | passed ${summary.passed} | failed ${summary.failed} | blocking ${summary.blockingFailed}`,
  );
  if (summary.knownIssueFailed > 0) {
    lines.push(`Known issues still failing: ${summary.knownIssueFailed}`);
  }
  if (summary.knownIssueResolved > 0) {
    lines.push(
      `Known issues resolved (update dataset): ${summary.knownIssueResolved}`,
    );
  }
  lines.push(
    `Metrics: Top@1=${summary.metrics.top1.toFixed(3)} MRR=${summary.metrics.mrr.toFixed(3)} Recall@K=${summary.metrics.recallAtK.toFixed(3)}`,
  );

  lines.push("");
  lines.push("By category:");
  for (const [category, bucket] of Object.entries(summary.byCategory).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    lines.push(
      `  ${category.padEnd(16)} n=${String(bucket.total).padStart(2)}  top1=${bucket.top1.toFixed(2)}  mrr=${bucket.mrr.toFixed(2)}  recall=${bucket.recallAtK.toFixed(2)}  pass=${bucket.passed}/${bucket.total}`,
    );
  }

  const failing = summary.caseResults.filter((r) => !r.passed);
  const showCases = options?.failuresOnly
    ? failing
    : options?.verbose
      ? summary.caseResults
      : failing;

  if (showCases.length > 0) {
    lines.push("");
    lines.push(
      options?.failuresOnly || !options?.verbose ? "Failures:" : "Cases:",
    );
    for (const result of showCases) {
      const tag = result.knownIssue ? " [known-issue]" : "";
      lines.push(`  - ${result.id}${tag}: "${result.query}"`);
      for (const failure of result.failures) {
        lines.push(`      ${failure}`);
      }
      if (result.actualTop.length > 0) {
        lines.push(
          `      actual: ${result.actualTop
            .slice(0, 5)
            .map((h) => `#${h.rank} ${h.id} (${h.score.toFixed(1)})`)
            .join(" | ")}`,
        );
      }
    }
  }

  if (summary.knownIssueResolved > 0) {
    lines.push("");
    lines.push("Resolved known issues (remove knownIssue from eval JSON):");
    for (const result of summary.caseResults.filter((r) => r.knownIssueResolved)) {
      lines.push(`  - ${result.id}: "${result.query}"`);
    }
  }

  return lines.join("\n");
}

export function probeDocsSearch(
  search: (query: string, limit: number) => AuthoringDocSearchHit[],
  query: string,
  limit = 10,
): string {
  const hits = search(query, limit);
  const lines = [
    `Probe: "${query}"`,
    `Matches: ${hits.length} (limit ${limit})`,
    "",
  ];
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    const id = authoringDocRowId(hit.row);
    lines.push(
      `${i + 1}. [${hit.score.toFixed(2)}] ${id} — ${hit.row.title}`,
    );
  }
  if (hits.length === 0) lines.push("(no results)");
  return lines.join("\n");
}
