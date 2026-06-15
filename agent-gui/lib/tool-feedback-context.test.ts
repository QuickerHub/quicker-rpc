import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import type { AgentUIMessage } from "@/lib/chat-types";
import { formatLocalToolResult } from "./tool-result.ts";
import {
  collectRecentToolFeedback,
  formatRecentToolFeedbackForPrompt,
} from "./tool-feedback-context.ts";

function assistantWithTool(output: unknown): AgentUIMessage {
  return {
    id: randomUUID(),
    role: "assistant",
    parts: [
      {
        type: "tool-workspace_program",
        toolCallId: randomUUID(),
        state: "output-available",
        input: {},
        output,
      },
    ],
  } as AgentUIMessage;
}

test("collectRecentToolFeedback extracts structured next actions", () => {
  const messages = [
    assistantWithTool(
      formatLocalToolResult(
        { action: "program-patch" },
        true,
        undefined,
        {
          summary: "Program patch saved.",
          nextActions: [
            {
              tool: "workspace_program",
              reason: "Run diagnostics.",
              priority: "recommended",
              input: { action: "diagnostics" },
            },
          ],
        },
      ),
    ),
  ];

  const [feedback] = collectRecentToolFeedback(messages);
  assert.equal(feedback?.toolName, "workspace_program");
  assert.equal(feedback?.summary, "Program patch saved.");
  assert.equal(feedback?.nextActions[0]?.input?.action, "diagnostics");
});

test("formatRecentToolFeedbackForPrompt renders compact recovery hints", () => {
  const block = formatRecentToolFeedbackForPrompt([
    {
      toolName: "workspace_program",
      summary: "Diagnostics still running.",
      retryable: true,
      userDecisionRequired: false,
      nextActions: [
        {
          tool: "workspace_program",
          reason: "Wait for lint.",
          priority: "recommended",
          input: { action: "diagnostics", waitMs: 30000 },
        },
      ],
    },
  ]);

  assert.ok(block.includes("## Recent tool feedback"));
  assert.ok(block.includes("workspace_program (retryable)"));
  assert.ok(block.includes("recommended workspace_program"));
  assert.ok(block.includes("\"waitMs\":30000"));
});

test("formatRecentToolFeedbackForPrompt omits empty feedback", () => {
  assert.equal(formatRecentToolFeedbackForPrompt([]), "");
});
