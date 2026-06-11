import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignRefsToSearchMatches,
  buildPageSearchResult,
  rankSearchCandidates,
  scoreTextMatch,
} from "./page-search.mjs";

describe("page-search", () => {
  it("scores exact header match highest", () => {
    const header = scoreTextMatch("获赞", {
      role: "columnheader",
      tag: "th",
      text: "获赞",
      name: null,
    });
    const cell = scoreTextMatch("获赞", {
      role: "cell",
      tag: "td",
      text: "获赞 136 252",
      name: null,
    });
    assert.ok(header > cell);
  });

  it("ranks unique exact matches first", () => {
    const ranked = rankSearchCandidates("获赞", [
      { role: "columnheader", tag: "th", text: "获赞" },
      { role: "cell", tag: "td", text: "QuickerAgent 36 134 215" },
      { role: "cell", tag: "td", text: "获赞 99" },
    ]);
    assert.equal(ranked[0]?.text, "获赞");
    assert.equal(ranked[0]?.role, "columnheader");
  });

  it("assigns refs for click follow-up", () => {
    const built = buildPageSearchResult(
      "获赞",
      [{ role: "columnheader", tag: "th", text: "获赞" }],
      {},
      5,
    );
    assert.equal(built.matchCount, 1);
    assert.match(built.matches[0].ref, /^e\d+$/);
    assert.equal(built.refMap[built.matches[0].ref].role, "columnheader");
  });

  it("merges with existing ref map", () => {
    const existing = {
      e1: { role: "link", name: "Home", nth: 0 },
    };
    const { refMap, matches } = assignRefsToSearchMatches(
      [{ role: "columnheader", name: "获赞", text: "获赞", score: 900, tag: "th" }],
      existing,
    );
    assert.equal(refMap.e1.name, "Home");
    assert.equal(matches[0].ref, "e2");
  });
});
