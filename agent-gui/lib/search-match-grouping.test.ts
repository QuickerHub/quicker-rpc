import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countSearchMatchHits,
  groupMatchesByPath,
  normalizeGrepMatchesByPath,
} from "@/lib/search-match-grouping";

describe("search-match-grouping", () => {
  it("groups flat line matches by file path", () => {
    const grouped = groupMatchesByPath(
      [
        { path: "a.ts", line: 1, content: "foo" },
        { path: "b.ts", line: 2, content: "bar" },
        { path: "a.ts", line: 9, content: "foo again" },
      ],
      (match) => ({ line: match.line, content: match.content }),
    );
    assert.equal(grouped.length, 2);
    assert.equal(grouped[0].path, "a.ts");
    assert.equal(grouped[0].hits.length, 2);
    assert.equal(grouped[0].hits[0].line, 1);
    assert.equal(grouped[0].hits[1].line, 9);
    assert.equal(grouped[1].path, "b.ts");
    assert.equal(grouped[1].hits.length, 1);
  });

  it("counts hits in grouped and legacy flat payloads", () => {
    assert.equal(
      countSearchMatchHits([
        { path: "a.ts", hits: [{ line: 1 }, { line: 2 }] },
        { path: "b.ts", hits: [{ line: 3 }] },
      ]),
      3,
    );
    assert.equal(
      countSearchMatchHits([
        { path: "a.ts", line: 1, content: "x" },
        { path: "a.ts", line: 2, content: "y" },
      ]),
      2,
    );
  });

  it("merges duplicate grep paths and legacy flat rows", () => {
    const grouped = normalizeGrepMatchesByPath([
      { path: "f-0.ts", hits: [{ line: 1, content: "a" }] },
      { path: "f-0.ts", hits: [{ line: 2, content: "b" }] },
      { path: "a.ts", line: 3, content: "c" },
    ]);
    assert.equal(grouped.length, 2);
    assert.equal(grouped[0].path, "f-0.ts");
    assert.equal(grouped[0].hits.length, 2);
    assert.equal(grouped[1].path, "a.ts");
    assert.equal(grouped[1].hits.length, 1);
  });
});
