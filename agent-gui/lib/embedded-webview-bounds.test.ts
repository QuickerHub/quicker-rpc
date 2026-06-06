import assert from "node:assert/strict";
import { test } from "node:test";
import { boundsRectKey } from "@/lib/embedded-webview-bounds";

test("boundsRectKey rounds layout box for stable comparisons", () => {
  assert.equal(
    boundsRectKey({ left: 10.4, top: 20.6, width: 300.2, height: 400.8 } as DOMRect),
    "10,21,300,401",
  );
  assert.notEqual(
    boundsRectKey({ left: 10, top: 20, width: 300, height: 400 } as DOMRect),
    boundsRectKey({ left: 11, top: 20, width: 300, height: 400 } as DOMRect),
  );
});
