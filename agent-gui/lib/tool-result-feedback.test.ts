import assert from "node:assert/strict";
import { test } from "node:test";

import {
  attachToolFeedback,
  formatLocalToolResult,
} from "./tool-result.ts";

test("formatLocalToolResult carries optional feedback metadata", () => {
  const result = formatLocalToolResult(
    { action: "demo" },
    true,
    undefined,
    {
      summary: "done",
      nextActions: [
        {
          tool: "workspace_program",
          reason: "verify",
          priority: "recommended",
        },
      ],
    },
  );

  assert.equal(result.summary, "done");
  assert.equal(result.nextActions?.[0]?.tool, "workspace_program");
  assert.equal(result.nextActions?.[0]?.priority, "recommended");
});

test("attachToolFeedback appends next actions on structured results", () => {
  const result = attachToolFeedback(
    formatLocalToolResult(
      { action: "demo" },
      true,
      undefined,
      {
        nextActions: [{ tool: "first", reason: "already present" }],
      },
    ),
    {
      retryable: true,
      nextActions: [{ tool: "second", reason: "new hint" }],
    },
  );

  assert.equal(result.retryable, true);
  assert.deepEqual(
    result.nextActions?.map((action) => action.tool),
    ["first", "second"],
  );
});

test("attachToolFeedback leaves non-structured results unchanged", () => {
  const result = { raw: true };
  assert.equal(
    attachToolFeedback(result, { summary: "ignored" }),
    result,
  );
});
