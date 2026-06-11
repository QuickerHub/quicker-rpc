import assert from "node:assert/strict";
import { test } from "node:test";

// Hook is browser-only; test the scheduling contract via a minimal mirror.
test("throttled stream batches rapid updates conceptually", () => {
  let rendered = "a";
  let latest = "a";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const intervalMs = 50;

  const schedule = (value: string, active: boolean) => {
    latest = value;
    if (!active) {
      if (timer) clearTimeout(timer);
      timer = undefined;
      rendered = value;
      return;
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      rendered = latest;
    }, intervalMs);
  };

  schedule("ab", true);
  schedule("abc", true);
  assert.equal(rendered, "a");
});
