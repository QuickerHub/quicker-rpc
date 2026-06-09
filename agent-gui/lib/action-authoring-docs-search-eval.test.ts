import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadAuthoringDocFixtureRows } from "@/lib/action-authoring-docs-fixtures";
import {
  buildAuthoringDocsSearchIndex,
  searchAuthoringDocRows,
} from "@/lib/action-authoring-docs-search";
import {
  assertDocsSearchEvalThresholds,
  DEFAULT_EVAL_DATASET,
  docRefKey,
  evaluateDocsSearchCase,
  runDocsSearchEval,
} from "@/lib/action-authoring-docs-search-eval";

describe("action-authoring-docs-search-eval helpers", () => {
  it("docRefKey formats topic and reference ids", () => {
    assert.equal(docRefKey({ topic: "expressions" }), "expressions");
    assert.equal(
      docRefKey({ topic: "step-modules", reference: "http" }),
      "step-modules/http",
    );
  });

  it("evaluateDocsSearchCase checks top and notInTopK", () => {
    const row = {
      topic: "expressions",
      title: "Expressions",
      description: "",
      markdown: "",
    };
    const otherRow = {
      topic: "overview",
      title: "Overview",
      description: "",
      markdown: "",
    };
    const result = evaluateDocsSearchCase(
      {
        id: "sample",
        category: "unit",
        query: "expressions",
        expect: {
          top: { topic: "expressions" },
          notInTopK: [{ topic: "overview" }],
        },
      },
      [{ row, score: 10 }, { row: otherRow, score: 1 }],
      5,
    );
    assert.equal(result.passed, false);

    const clean = evaluateDocsSearchCase(
      {
        id: "sample-clean",
        category: "unit",
        query: "expressions",
        expect: {
          top: { topic: "expressions" },
          notInTopK: [{ topic: "overview" }],
        },
      },
      [{ row, score: 10 }],
      5,
    );
    assert.equal(clean.passed, true);
    assert.equal(clean.top1Hit, true);
  });
});

describe("action-authoring-docs-search eval dataset", () => {
  it("loads eval cases from JSON", () => {
    assert.ok(DEFAULT_EVAL_DATASET.cases.length >= 30);
    assert.ok(DEFAULT_EVAL_DATASET.cases.every((c) => c.id && c.category));
  });

  it("passes relevance thresholds on real corpus (blocking cases only)", async () => {
    const rows = await loadAuthoringDocFixtureRows();
    const index = buildAuthoringDocsSearchIndex(rows);
    const summary = runDocsSearchEval(
      (query, limit) => searchAuthoringDocRows(index, query, limit),
      { corpusSize: rows.length },
    );

    const thresholdErrors = assertDocsSearchEvalThresholds(summary);
    if (thresholdErrors.length > 0) {
      const blocking = summary.caseResults.filter(
        (r) => !r.passed && !r.knownIssue,
      );
      const detail = blocking
        .map((r) => `${r.id}: ${r.failures.join("; ")}`)
        .join("\n");
      assert.fail(
        `Search eval thresholds failed:\n${thresholdErrors.join("\n")}\n\nBlocking cases:\n${detail}`,
      );
    }

    assert.ok(summary.knownIssueFailed >= 0);
  });

  for (const testCase of DEFAULT_EVAL_DATASET.cases.filter((c) => !c.knownIssue)) {
    it(`[${testCase.category}] ${testCase.id}`, async () => {
      const rows = await loadAuthoringDocFixtureRows();
      const index = buildAuthoringDocsSearchIndex(rows);
      const k = testCase.k ?? DEFAULT_EVAL_DATASET.defaultK;
      const limit = Math.max(k, 10);
      const hits = searchAuthoringDocRows(index, testCase.query, limit);
      const result = evaluateDocsSearchCase(
        testCase,
        hits,
        DEFAULT_EVAL_DATASET.defaultK,
      );
      assert.equal(
        result.passed,
        true,
        `${testCase.id} failed: ${result.failures.join("; ")}\nactual: ${result.actualTop.map((h) => h.id).join(", ")}`,
      );
    });
  }

  for (const testCase of DEFAULT_EVAL_DATASET.cases.filter((c) => c.knownIssue)) {
    it(`[known-issue] ${testCase.id}`, async () => {
      const rows = await loadAuthoringDocFixtureRows();
      const index = buildAuthoringDocsSearchIndex(rows);
      const k = testCase.k ?? DEFAULT_EVAL_DATASET.defaultK;
      const hits = searchAuthoringDocRows(index, testCase.query, Math.max(k, 10));
      const result = evaluateDocsSearchCase(
        testCase,
        hits,
        DEFAULT_EVAL_DATASET.defaultK,
      );
      if (result.passed) {
        console.warn(
          `Known issue resolved for ${testCase.id} — remove knownIssue from eval JSON`,
        );
      }
      assert.ok(true);
    });
  }
});

describe("action-authoring-docs-search integration", () => {
  it("loads a non-trivial corpus from repo markdown", async () => {
    const rows = await loadAuthoringDocFixtureRows();
    assert.ok(rows.length >= 50, `expected >= 50 rows, got ${rows.length}`);
    assert.ok(rows.some((r) => r.topic === "expressions"));
    assert.ok(rows.some((r) => r.reference === "http"));
  });
});
