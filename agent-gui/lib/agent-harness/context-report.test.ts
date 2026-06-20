import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTurnContextReport,
  reconcileTurnContextReportWithApiUsage,
} from "./context-report";

test("buildTurnContextReport sums category buckets", () => {
  const report = buildTurnContextReport({
    system: "x".repeat(400),
    tools: {
      docs: {
        description: "d".repeat(200),
        inputSchema: { type: "object" },
      },
    },
    modelMessages: [{ role: "user", content: "hello" }],
    contextLimit: 128_000,
  });

  assert.equal(report.contextWindowTokens, 128_000);
  assert.ok(report.estimatedInputTokens > 0);
  assert.equal(report.categories.length, 3);
  const sum = report.categories.reduce((n, c) => n + c.tokens, 0);
  assert.equal(report.estimatedInputTokens, sum);
});

test("reconcileTurnContextReportWithApiUsage adds residual to conversation", () => {
  const report = buildTurnContextReport({
    system: "x".repeat(400),
    tools: {},
    modelMessages: [{ role: "user", content: "hi" }],
    contextLimit: 128_000,
  });
  const conversationBefore = report.categories.find((c) => c.id === "conversation")!.tokens;
  assert.ok(conversationBefore < 50);

  const reconciled = reconcileTurnContextReportWithApiUsage(report, 50_000);
  const conversationAfter = reconciled.categories.find((c) => c.id === "conversation")!.tokens;

  assert.equal(reconciled.estimatedInputTokens, 50_000);
  assert.ok(conversationAfter > conversationBefore);
  assert.equal(
    reconciled.categories.reduce((n, c) => n + c.tokens, 0),
    50_000,
  );
});
