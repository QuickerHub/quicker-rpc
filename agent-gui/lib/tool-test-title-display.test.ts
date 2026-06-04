import test from "node:test";
import assert from "node:assert/strict";
import { buildTitleTestDisplayMessages } from "@/lib/tool-test-title-display";
import type { TitleTestRunEntry } from "@/lib/tool-test-title-runs";

function baseRun(overrides: Partial<TitleTestRunEntry> = {}): TitleTestRunEntry {
  return {
    id: "run-1",
    at: 0,
    userText: "hello",
    assistantText: "",
    localReference: "hello",
    llmSelection: "deepseek",
    llmModelLabel: "DeepSeek",
    status: "running",
    ...overrides,
  };
}

test("buildTitleTestDisplayMessages shows request preview when stream empty", () => {
  const run = baseRun({
    requestPayload: "新建动作：读剪贴板",
    chatMessages: [],
  });
  const msgs = buildTitleTestDisplayMessages(run);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0]?.role, "user");
  assert.match(String(msgs[0]?.parts[0] && "text" in msgs[0].parts[0] ? msgs[0].parts[0].text : ""), /剪贴板/);
});

test("buildTitleTestDisplayMessages prefers live chat messages", () => {
  const run = baseRun({
    requestPayload: "preview",
    chatMessages: [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "live" }],
      },
    ],
  });
  const msgs = buildTitleTestDisplayMessages(run);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0]?.parts[0] && "text" in msgs[0].parts[0] ? msgs[0].parts[0].text : "", "live");
});
