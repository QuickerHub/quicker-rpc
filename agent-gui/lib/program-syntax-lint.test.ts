import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDiagnosticsFixReadInput,
  evaluateProgramDiagnosticsPayload,
} from "./program-syntax-lint.ts";

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

test("evaluateProgramDiagnosticsPayload ok when only interpolation warnings", () => {
  const result = evaluateProgramDiagnosticsPayload({
    status: "ready",
    summary: { errorCount: 0, warningCount: 1, checked: 0, skipped: 0 },
    issues: [
      {
        severity: "warning",
        code: "MISSING_INTERPOLATION_PREFIX",
        kind: "Interpolation",
        message: "Possible missing prefix",
      },
    ],
  });
  assert.equal(result.ok, true);
  assert.match(result.hint ?? "", /non-blocking/i);
});

test("buildDiagnosticsFixReadInput uses issue read slice", () => {
  const input = buildDiagnosticsFixReadInput(
    {
      issues: [
        {
          severity: "error",
          code: "EXPR_SYNTAX",
          location: {
            read: {
              action: "read_data",
              startLine: 12,
              endLine: 18,
              mode: "content",
            },
          },
        },
      ],
    },
    { target: "action", id: "abc" },
  );
  assert.deepEqual(input, {
    action: "read_data",
    target: "action",
    id: "abc",
    mode: "content",
    startLine: 12,
    endLine: 18,
  });
});
