import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ModelMessage } from "ai";
import {
  createStepMicrocompactPrepareStep,
  estimateModelMessagesTokens,
  microcompactStepModelMessages,
  shouldMicrocompactStepMessages,
} from "@/lib/context-step-microcompact";

function toolResultMessage(
  toolCallId: string,
  output: unknown,
): ModelMessage {
  return {
    role: "tool",
    content: [{
      type: "tool-result",
      toolCallId,
      toolName: "shell_exec",
      output: { type: "json", value: output },
    }],
  };
}

describe("microcompactStepModelMessages", () => {
  it("compacts older tool results but keeps the latest two", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "run tools" },
      toolResultMessage("c1", { ok: true, stdout: "a".repeat(8000) }),
      toolResultMessage("c2", { ok: true, stdout: "b".repeat(8000) }),
      toolResultMessage("c3", { ok: true, stdout: "c".repeat(8000) }),
    ];

    const result = microcompactStepModelMessages(messages, {
      protectRecentToolResults: 2,
      minOutputTokens: 512,
    });

    assert.equal(result.applied, true);
    const first = result.messages[1]!.content[0] as {
      output?: { value?: Record<string, unknown> };
    };
    const last = result.messages[3]!.content[0] as {
      output?: { value?: Record<string, unknown> };
    };
    assert.equal(first.output?.value?.compact, true);
    assert.notEqual(last.output?.value?.compact, true);
    assert.ok(result.tokensSavedEstimate > 0);
  });
});

describe("createStepMicrocompactPrepareStep", () => {
  it("returns compacted messages on later steps when over threshold", () => {
    const prepareStep = createStepMicrocompactPrepareStep({
      contextLimit: 10_000,
      minStepNumber: 1,
    });
    const messages: ModelMessage[] = [
      { role: "user", content: "x".repeat(20_000) },
      toolResultMessage("c1", { ok: true, stdout: "y".repeat(8000) }),
      toolResultMessage("c2", { ok: true, stdout: "z".repeat(8000) }),
      toolResultMessage("c3", { ok: true, stdout: "w".repeat(8000) }),
    ];

    assert.equal(
      prepareStep({ stepNumber: 0, messages, model: {} as never }),
      undefined,
    );
    const prepared = prepareStep({
      stepNumber: 2,
      messages,
      model: {} as never,
    });
    assert.ok(prepared?.messages);
    assert.ok(
      estimateModelMessagesTokens(prepared!.messages!)
      < estimateModelMessagesTokens(messages),
    );
    assert.equal(shouldMicrocompactStepMessages(messages, 10_000), true);
  });
});
