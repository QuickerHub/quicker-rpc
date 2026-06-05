import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatProgramDiagnosticsMetaLine,
  parseProgramDiagnosticsFromToolData,
} from "./program-diagnostics-view.ts";

test("parseProgramDiagnosticsFromToolData accepts program-diagnostics wrapper", () => {
  const view = parseProgramDiagnosticsFromToolData({
    action: "program-diagnostics",
    success: true,
    program: "action abc…",
    status: "ready",
    schema: "qkrpc.program-diagnostics.v1",
    summary: { errorCount: 0, warningCount: 0, checked: 2, skipped: 0 },
    issues: [],
  });
  assert.ok(view);
  assert.equal(view!.status, "ready");
  assert.equal(view!.summary?.checked, 2);
});

test("parseProgramDiagnosticsFromToolData reads issues from serve payload", () => {
  const view = parseProgramDiagnosticsFromToolData({
    action: "project-diagnostics-get",
    status: "ready",
    summary: { errorCount: 1, warningCount: 0, checked: 1, skipped: 0 },
    issues: [
      {
        severity: "Error",
        kind: "expression",
        code: "EXPR_SYNTAX",
        message: "Unexpected token",
        locationSummary: "step x · sys:evalexpression · data.json steps[0].inputParams.expression",
        location: {
          stepPath: "0",
          stepRunnerKey: "sys:evalexpression",
          paramName: "expression",
          dataJsonPath: "steps[0].inputParams.expression",
          read: { tool: "workspace_action_read_data", mode: "content" },
        },
      },
    ],
    issueCount: 1,
  });
  assert.ok(view);
  assert.equal(view!.issues.length, 1);
  assert.equal(view!.issues[0]?.severity, "error");
  assert.equal(view!.issues[0]?.code, "EXPR_SYNTAX");
});

test("formatProgramDiagnosticsMetaLine", () => {
  assert.match(
    formatProgramDiagnosticsMetaLine({
      status: "ready",
      issues: [],
      summary: { errorCount: 0, warningCount: 0, checked: 1, skipped: 0 },
      program: "动作",
    }),
    /0 错误/,
  );
  assert.equal(
    formatProgramDiagnosticsMetaLine({
      status: "ready",
      issues: [],
      summary: { errorCount: 2, warningCount: 1, checked: 3, skipped: 0 },
    }),
    "2 错误 · 1 警告",
  );
});
