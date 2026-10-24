import assert from "node:assert/strict";
import { test } from "node:test";
import { nativeIconHexToCss } from "./icon-color";
import { faIconGeometryFill } from "./fa-icon";

test("native icon hex uses ARGB storage and CSS RGBA presentation", () => {
  for (const [native, css] of [["#80112233", "#11223380"], ["#FF112233", "#112233"],
    ["#00112233", "#11223300"], ["#FFFFBA00", "#FFBA00"], [" #abc ", "#AABBCC"], ["#a1b2c3", "#A1B2C3"]]) {
    assert.equal(nativeIconHexToCss(native), css);
  }
  for (const token of ["80112233", "#1234", "#12345", "#1234567", "#GG112233", "red", "success", "rgb(1 2 3)", ""]) {
    assert.equal(nativeIconHexToCss(token), undefined, token);
  }
});

test("geometry uses explicit native spec once without rewriting V1 or already-CSS V2 metadata", () => {
  for (const native of ["#80112233", "#FF112233", "#00112233", "#abc", "#a1b2c3"]) {
    const expected = nativeIconHexToCss(native)!;
    for (const color of [native, expected]) {
      const geometry = Object.freeze({ spec: `fa:Light_Example:${native}`, color });
      assert.equal(faIconGeometryFill(geometry), expected);
      assert.deepEqual(geometry, { spec: `fa:Light_Example:${native}`, color });
    }
  }
});

test("missing or invalid native specs leave adapter CSS colors in their existing domain", () => {
  for (const spec of [undefined, "fa:Light_Example", "fa:Light_Example:success", "wrong:Light_Example:#80112233",
    "fa::#80112233", "fa:Light_Example:#80112233:extra", "fa:Light_Example:#1234", "fa:Light_Example:80112233"]) {
    assert.equal(faIconGeometryFill({ spec, color: "#11223380" }), "#11223380", spec);
  }
  assert.equal(faIconGeometryFill({ color: "rebeccapurple" }), "rebeccapurple", "existing adapter CSS is consumed, not revalidated as a native spec");
  assert.equal(faIconGeometryFill({ color: "" }), "currentColor");
  assert.equal(faIconGeometryFill({}), "currentColor");
});
