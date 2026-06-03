import assert from "node:assert/strict";
import test from "node:test";
import {
  faDisplayLabel,
  faEnumNameToSpec,
  formatFaSearchMetaLine,
  formatFaSearchPlainText,
  parseFaSearchFromQkrpcData,
} from "./fa-search.ts";

test("parses CLI fa-search envelope", () => {
  const parsed = parseFaSearchFromQkrpcData({
    ok: true,
    action: "fa-search",
    query: "code",
    matchCount: 2,
    names: ["Light_Barcode", "Brands_Codepen"],
    defaultStyle: "Light",
  });
  assert.ok(parsed);
  assert.equal(parsed!.meta.keyword, "code");
  assert.equal(parsed!.meta.matchCount, 2);
  assert.deepEqual(parsed!.names, ["Light_Barcode", "Brands_Codepen"]);
});

test("parses serve payload with PascalCase", () => {
  const parsed = parseFaSearchFromQkrpcData({
    ok: true,
    action: "fa-search",
    payload: {
      Success: true,
      Keyword: "code",
      MatchCount: 10,
      Names: ["Brands_Centercode", "Light_Barcode"],
      DefaultStyle: "Light",
    },
  });
  assert.ok(parsed);
  assert.equal(parsed!.meta.keyword, "code");
  assert.equal(parsed!.names.length, 2);
});

test("fa spec and label helpers", () => {
  assert.equal(faEnumNameToSpec("Light_Barcode"), "fa:Light_Barcode");
  assert.equal(faDisplayLabel("Brands_Github"), "Github");
  assert.equal(formatFaSearchMetaLine({ keyword: "code", matchCount: 10 }), "「code」 · 10 个图标");
  assert.equal(
    formatFaSearchPlainText(["Light_Barcode", "Brands_Codepen"]),
    "fa:Light_Barcode\nfa:Brands_Codepen",
  );
});
