import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  alignSplitIndexToRoundStart,
  groupMessagesIntoApiRounds,
} from "@/lib/context-api-rounds";

describe("groupMessagesIntoApiRounds", () => {
  it("groups user-anchored rounds", () => {
    const messages: AgentUIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "a" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "b" }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "c" }] },
    ];
    const rounds = groupMessagesIntoApiRounds(messages);
    assert.equal(rounds.length, 2);
    assert.deepEqual(rounds[0]!.map((m) => m.id), ["u1", "a1"]);
    assert.deepEqual(rounds[1]!.map((m) => m.id), ["u2"]);
  });
});

describe("alignSplitIndexToRoundStart", () => {
  it("aligns to user message", () => {
    const messages: AgentUIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "a" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "b" }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "c" }] },
    ];
    assert.equal(alignSplitIndexToRoundStart(messages, 1), 0);
    assert.equal(alignSplitIndexToRoundStart(messages, 2), 2);
  });
});
