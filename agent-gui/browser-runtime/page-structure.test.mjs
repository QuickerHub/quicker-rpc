import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInteractiveSnapshot,
  buildRefMapFromNodes,
  normalizePageOutline,
} from "./page-structure.mjs";

describe("page-structure", () => {
  it("builds ref map and yaml snapshot from nodes", () => {
    const built = buildInteractiveSnapshot("https://example.com", "Example", [
      { role: "link", name: "Home", href: "https://example.com/" },
      { role: "button", name: "Go" },
    ]);
    assert.match(built.snapshot, /ref=e1/);
    assert.match(built.snapshot, /role=link/);
    assert.equal(built.nodeCount, 2);
    assert.equal(buildRefMapFromNodes([]).e1, undefined);
  });

  it("normalizes page outline", () => {
    const outline = normalizePageOutline({
      headings: [{ level: 1, text: "Title" }],
      links: [{ text: "A", href: "https://a" }],
      landmarks: [{ role: "main", text: "body" }],
      meta: { description: "desc" },
    });
    assert.equal(outline.headings.length, 1);
    assert.equal(outline.links.length, 1);
    assert.equal(outline.meta.description, "desc");
  });
});
