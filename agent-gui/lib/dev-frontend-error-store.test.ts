import assert from "node:assert/strict";
import test from "node:test";
import { clientErrorsToIssues } from "@/lib/dev-frontend-error-store.server";

test("clientErrorsToIssues drops React Fast Refresh transient errors", () => {
  const now = Date.parse("2026-06-04T12:00:00.000Z");
  const issues = clientErrorsToIssues(
    [
      {
        kind: "error",
        message: "Uncaught ReferenceError: onOpenInExplorer is not defined",
        stack:
          "ReferenceError: onOpenInExplorer is not defined\n"
          + "    at performReactRefresh (react-refresh-runtime)",
        url: "http://127.0.0.1:3000/",
        at: "2026-06-04T11:59:00.000Z",
      },
      {
        kind: "error",
        message: "Uncaught Error: real bug",
        stack: "Error: real bug\n    at Page (page.tsx:1:1)",
        url: "http://127.0.0.1:3000/",
        at: "2026-06-04T11:59:30.000Z",
      },
    ],
    { now },
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.message, "Uncaught Error: real bug");
});

test("clientErrorsToIssues drops errors older than maxAgeMs", () => {
  const now = Date.parse("2026-06-04T12:00:00.000Z");
  const issues = clientErrorsToIssues(
    [
      {
        kind: "error",
        message: "stale",
        url: "http://127.0.0.1:3000/",
        at: "2026-06-04T11:00:00.000Z",
      },
    ],
    { now, maxAgeMs: 5 * 60 * 1000 },
  );
  assert.equal(issues.length, 0);
});
