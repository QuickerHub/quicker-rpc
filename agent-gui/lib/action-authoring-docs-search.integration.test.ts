import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadAuthoringDocFixtureRows } from "@/lib/action-authoring-docs-fixtures";
import {
  buildAuthoringDocsSearchIndex,
  searchAuthoringDocRows,
} from "@/lib/action-authoring-docs-search";

type SearchExpectation = {
  query: string;
  topTopic: string;
  topReference?: string;
  minMatches?: number;
};

const SEARCH_EXPECTATIONS: SearchExpectation[] = [
  { query: "expressions", topTopic: "expressions", minMatches: 1 },
  { query: "workspace patch", topTopic: "workspace-editing", minMatches: 1 },
  { query: "sys:http", topTopic: "step-modules", topReference: "http", minMatches: 1 },
  { query: "webview2", topTopic: "webview2-authoring", minMatches: 1 },
  { query: "step runner", topTopic: "step-runner-search", minMatches: 1 },
  { query: "workspac", topTopic: "workspace-editing", minMatches: 1 },
  { query: "子程序", topTopic: "step-modules", topReference: "subprogram", minMatches: 1 },
];

describe("action-authoring-docs-search integration", () => {
  it("loads a non-trivial corpus from repo markdown", async () => {
    const rows = await loadAuthoringDocFixtureRows();
    assert.ok(rows.length >= 50, `expected >= 50 rows, got ${rows.length}`);
    assert.ok(rows.some((r) => r.topic === "expressions"));
    assert.ok(rows.some((r) => r.reference === "http"));
  });

  for (const spec of SEARCH_EXPECTATIONS) {
    it(`query "${spec.query}" → ${spec.topTopic}${spec.topReference ? `/${spec.topReference}` : ""}`, async () => {
      const rows = await loadAuthoringDocFixtureRows();
      const index = buildAuthoringDocsSearchIndex(rows);
      const hits = searchAuthoringDocRows(index, spec.query, 5);

      assert.ok(
        hits.length >= (spec.minMatches ?? 1),
        `expected matches for "${spec.query}", got ${hits.length}`,
      );

      const top = hits[0];
      assert.equal(
        top.row.topic,
        spec.topTopic,
        `top topic mismatch for "${spec.query}": got ${top.row.topic}`,
      );
      if (spec.topReference) {
        assert.equal(
          top.row.reference,
          spec.topReference,
          `top reference mismatch for "${spec.query}": got ${top.row.reference ?? "(none)"}`,
        );
      }
      assert.ok(top.score > 0, `expected positive score for "${spec.query}"`);
    });
  }

  it("empty query returns topic-sorted catalog", async () => {
    const rows = await loadAuthoringDocFixtureRows();
    const index = buildAuthoringDocsSearchIndex(rows);
    const hits = searchAuthoringDocRows(index, "", 20);
    assert.equal(hits.length, 20);
    const topics = hits.map((h) => h.row.topic);
    const sorted = [...topics].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    assert.deepEqual(topics, sorted);
    assert.equal(hits[0]?.score, 0);
  });
});
