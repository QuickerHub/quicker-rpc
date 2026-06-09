import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAuthoringDocsSearchIndex,
  compactMarkdownForSearch,
  searchAuthoringDocRows,
  tokenizeAuthoringDocText,
} from "@/lib/action-authoring-docs-search";

const SAMPLE_ROWS = [
  {
    topic: "expressions",
    title: "Expressions & interpolation",
    description: "P4 default: $=, $$, sys:evalexpression",
    markdown: "# Expressions\nUse $= for assignment in steps.",
  },
  {
    topic: "step-modules",
    reference: "http",
    title: "sys:http",
    description: "HTTP request step module",
    markdown: "# sys:http\nSend HTTP GET and POST requests.",
  },
  {
    topic: "workspace-editing",
    title: "Workspace editing",
    description: "Edit action projects on disk under .quicker/actions",
    markdown: "# Workspace editing\nUse workspace_program to patch data.json.",
  },
];

describe("action-authoring-docs-search", () => {
  it("tokenizes English identifiers and Chinese phrases", () => {
    const tokens = tokenizeAuthoringDocText("表达式 expressions sys:http");
    assert.ok(tokens.includes("expressions"));
    assert.ok(tokens.includes("表达式"));
    assert.ok(tokens.includes("表达"));
    assert.ok(tokens.includes("达式"));
  });

  it("ranks topic id matches above body-only matches", () => {
    const index = buildAuthoringDocsSearchIndex(SAMPLE_ROWS);
    const hits = searchAuthoringDocRows(index, "expressions", 5);
    assert.equal(hits[0]?.row.topic, "expressions");
  });

  it("finds reference docs by module key", () => {
    const index = buildAuthoringDocsSearchIndex(SAMPLE_ROWS);
    const hits = searchAuthoringDocRows(index, "sys:http", 5);
    assert.equal(hits[0]?.row.reference, "http");
  });

  it("supports fuzzy prefix matching", () => {
    const index = buildAuthoringDocsSearchIndex(SAMPLE_ROWS);
    const hits = searchAuthoringDocRows(index, "workspac", 5);
    assert.equal(hits[0]?.row.topic, "workspace-editing");
  });

  it("returns sorted catalog when query is empty", () => {
    const index = buildAuthoringDocsSearchIndex(SAMPLE_ROWS);
    const hits = searchAuthoringDocRows(index, "", 10);
    assert.equal(hits.length, SAMPLE_ROWS.length);
    assert.deepEqual(
      hits.map((h) => h.row.topic),
      ["expressions", "step-modules", "workspace-editing"],
    );
  });

  it("prefers sys: module ref over workflow topic on rerank", () => {
    const index = buildAuthoringDocsSearchIndex([
      ...SAMPLE_ROWS,
      {
        topic: "subprogram-workflow",
        title: "Subprograms",
        description: "workflow",
        markdown: "sys:subprogram call workflow",
      },
      {
        topic: "step-modules",
        reference: "subprogram",
        title: "sys:subprogram",
        description: "sys:subprogram",
        markdown: "# sys:subprogram",
      },
    ]);
    const hits = searchAuthoringDocRows(index, "sys:subprogram", 5);
    assert.equal(hits[0]?.row.reference, "subprogram");
  });

  it("compactMarkdownForSearch keeps headings and truncates body", () => {
    const md = "# Title\n\n" + "x".repeat(800);
    const compact = compactMarkdownForSearch(md, 100);
    assert.ok(compact.includes("Title"));
    assert.ok(compact.length < 200);
  });
});
