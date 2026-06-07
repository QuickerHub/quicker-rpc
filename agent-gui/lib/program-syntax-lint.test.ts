import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateProgramDiagnosticsPayload } from "./program-syntax-lint.ts";

test("evaluateProgramDiagnosticsPayload treats running lint as not ok", () => {
  const result = evaluateProgramDiagnosticsPayload({
    status: "running",
    summary: { errorCount: 0, warningCount: 0, checked: 0, skipped: 0 },
  });
  assert.equal(result.ok, false);
  assert.match(result.hint ?? "", /still running/i);
});

test("evaluateProgramDiagnosticsPayload ok when ready with zero errors", () => {
  const result = evaluateProgramDiagnosticsPayload({
    status: "ready",
    summary: { errorCount: 0, warningCount: 0, checked: 1, skipped: 0 },
  });
  assert.equal(result.ok, true);
});

test("evaluateProgramDiagnosticsPayload not ok when compile errors remain", () => {
  const result = evaluateProgramDiagnosticsPayload({
    status: "ready",
    summary: { errorCount: 1, warningCount: 0, checked: 1, skipped: 0 },
  });
  assert.equal(result.ok, false);
});
