import { describe, expect, it } from "vitest";
import { normalizeMarkdownGfmTables } from "./markdown-gfm-normalize.ts";

describe("normalizeMarkdownGfmTables", () => {
  it("inserts blank line between table and following paragraph", () => {
    const input = `| a | b |
|---|---|
| x | y |
note after table`;
    expect(normalizeMarkdownGfmTables(input)).toBe(
      `| a | b |
|---|---|
| x | y |

note after table`,
    );
  });

  it("does not break header and delimiter", () => {
    const input = `| a | b |
|---|---|
| x | y |`;
    expect(normalizeMarkdownGfmTables(input)).toBe(input);
  });
});
