import { describe, expect, it } from "vitest";
import { parseTextToolsValue, serializeTextToolsValue } from "./textToolCatalog";

describe("textToolCatalog", () => {
  it("round-trips comma-separated tool ids", () => {
    const raw = "SelectSingleFile,SelectWindowTitle,ExtraSelectMenu";
    expect(parseTextToolsValue(raw)).toEqual([
      "SelectSingleFile",
      "SelectWindowTitle",
      "ExtraSelectMenu",
    ]);
    expect(serializeTextToolsValue(parseTextToolsValue(raw))).toBe(raw);
  });
});
