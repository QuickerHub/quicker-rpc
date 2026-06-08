import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseDuckDuckGoHtml,
  resolveWebSearchProvider,
} from "@/lib/web-search.shared";

describe("web-search.server", () => {
  it("parseDuckDuckGoHtml extracts title url snippet", () => {
    const html = `
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&amp;rut=1">
        Example Title
      </a>
      <a class="result__snippet" href="#">A short snippet about the page.</a>
      <a class="result__a" href="https://other.test/doc">Other</a>
      <a class="result__snippet">Second snippet</a>
    `;

    const results = parseDuckDuckGoHtml(html, 5);
    assert.equal(results.length, 2);
    assert.equal(results[0]?.title, "Example Title");
    assert.equal(results[0]?.url, "https://example.com/page");
    assert.equal(results[0]?.snippet, "A short snippet about the page.");
    assert.equal(results[1]?.title, "Other");
    assert.equal(results[1]?.url, "https://other.test/doc");
    assert.equal(results[1]?.snippet, "Second snippet");
  });

  it("parseDuckDuckGoHtml respects limit", () => {
    const html = `
      <a class="result__a" href="https://a.test">A</a>
      <a class="result__a" href="https://b.test">B</a>
      <a class="result__a" href="https://c.test">C</a>
    `;
    assert.equal(parseDuckDuckGoHtml(html, 2).length, 2);
  });

  it("resolveWebSearchProvider defaults to duckduckgo without keys", () => {
    assert.equal(
      resolveWebSearchProvider({
        WEB_SEARCH_PROVIDER: undefined,
        BRAVE_SEARCH_API_KEY: undefined,
        WEB_SEARCH_API_KEY: undefined,
        TAVILY_API_KEY: undefined,
      }),
      "duckduckgo",
    );
    assert.equal(
      resolveWebSearchProvider({ TAVILY_API_KEY: "tvly-test" }),
      "tavily",
    );
    assert.equal(
      resolveWebSearchProvider({ BRAVE_SEARCH_API_KEY: "brave-test" }),
      "brave",
    );
  });
});
