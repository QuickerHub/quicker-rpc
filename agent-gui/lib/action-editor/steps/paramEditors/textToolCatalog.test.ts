import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseTextToolsValue, serializeTextToolsValue } from "./textToolCatalog";

describe("textToolCatalog", () => {
  test("round-trips comma-separated tool ids", () => {
    const raw = "SelectSingleFile,SelectWindowTitle,ExtraSelectMenu";
    assert.deepEqual(parseTextToolsValue(raw), [
      "SelectSingleFile",
      "SelectWindowTitle",
      "ExtraSelectMenu",
    ]);
    assert.equal(serializeTextToolsValue(parseTextToolsValue(raw)), raw);
  });
});
