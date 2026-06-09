import assert from "node:assert/strict";
import test from "node:test";
import { isReactRefreshTransientError } from "@/lib/dev-react-refresh-transient";

test("isReactRefreshTransientError detects Fast Refresh stack frames", () => {
  assert.equal(
    isReactRefreshTransientError({
      message: "Uncaught ReferenceError: onOpenInExplorer is not defined",
      stack: "ReferenceError: onOpenInExplorer is not defined\n    at performReactRefresh (react-refresh-runtime)",
    }),
    true,
  );
  assert.equal(
    isReactRefreshTransientError({
      message: "Uncaught Error: real bug",
      stack: "Error: real bug\n    at Page (page.tsx:1:1)",
    }),
    false,
  );
});
