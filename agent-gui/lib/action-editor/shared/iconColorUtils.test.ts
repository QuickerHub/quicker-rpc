import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalIconPickerColor, colorTokensEqual, cssPreviewColor, hexToHsv, hexToRgb, hsvToHex, normalizeColorToken, tryParseHex } from "./iconColorUtils";
import { buildFaIconSpec, parseFaIconSpec } from "./faIconPickerSearch";

test("native ARGB survives repeated picker/spec round trips while CSS converts once", () => {
  let color = "#80112233";
  for (let round = 0; round < 4; round++) {
    color = canonicalIconPickerColor(normalizeColorToken(color));
    const spec = buildFaIconSpec("Light_Example", color);
    assert.equal(spec, "fa:Light_Example:#80112233");
    assert.equal(cssPreviewColor(color), "#11223380");
    color = parseFaIconSpec(spec).color;
  }
  assert.deepEqual(hexToRgb(color), { r: 17, g: 34, b: 51 });
  const hsv = hexToHsv(color)!; assert.equal(hsv.h, 210); assert.equal(hsv.v, 51 / 255);
  assert.equal(hsvToHex(hsv), "#112233");
});

test("opaque/transparent native alpha and RGB shorthand keep distinct storage and display contracts", () => {
  for (const [native, css] of [["#FF112233", "#112233"], ["#00112233", "#11223300"], ["#FFFFBA00", "#FFBA00"]]) {
    assert.equal(normalizeColorToken(native), native); assert.equal(cssPreviewColor(native), css);
  }
  assert.equal(tryParseHex("#abc"), "#AABBCC");
  assert.equal(colorTokensEqual("#FF112233", "#112233"), true);
  assert.equal(colorTokensEqual("#80112233", "#112233"), false);
});

test("semantic spelling and explicit native colors are not rewritten into CSS tokens", () => {
  assert.equal(normalizeColorToken(" Success "), "Success");
  assert.equal(canonicalIconPickerColor("Success"), "Success");
  assert.equal(cssPreviewColor("Success"), "#22c55e");
  assert.equal(buildFaIconSpec("Light_Example", "Success"), "fa:Light_Example:Success");
  assert.equal(normalizeColorToken("#a0a0a0"), "#A0A0A0");
  assert.equal(normalizeColorToken("not-a-known-color"), "not-a-known-color");
});
