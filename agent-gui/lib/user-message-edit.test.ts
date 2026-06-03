import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  canEditUserMessage,
  confirmBranchUserMessageEdit,
  countMessagesRemovedOnBranch,
  findMessageIndex,
  getUserMessageDisplayText,
  resolveUserMessageDisplayText,
  upsertUserMessageDraft,
  userMessageHasLocalDraft,
} from "@/lib/user-message-edit";

function userMsg(id: string, text: string): AgentUIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
  };
}

describe("user-message-edit", () => {
  it("extracts display text from user parts", () => {
    const text = getUserMessageDisplayText(userMsg("u1", "删除这10个动作"));
    assert.equal(text, "删除这10个动作");
  });

  it("canEditUserMessage requires non-empty composed content", () => {
    assert.equal(canEditUserMessage(userMsg("u1", "hello")), true);
    assert.equal(canEditUserMessage(userMsg("u2", "   ")), false);
  });

  it("findMessageIndex locates by id", () => {
    const messages = [userMsg("a", "one"), userMsg("b", "two")];
    assert.equal(findMessageIndex(messages, "b"), 1);
    assert.equal(findMessageIndex(messages, "missing"), -1);
  });

  it("countMessagesRemovedOnBranch includes anchor and tail", () => {
    const messages = [userMsg("a", "1"), userMsg("b", "2"), userMsg("c", "3")];
    assert.equal(countMessagesRemovedOnBranch(messages, 1), 2);
    assert.equal(countMessagesRemovedOnBranch(messages, -1), 0);
  });

  it("confirmBranchUserMessageEdit skips when nothing removed", () => {
    assert.equal(confirmBranchUserMessageEdit(0), true);
  });

  it("resolveUserMessageDisplayText prefers local draft", () => {
    const message = userMsg("u1", "原始");
    assert.equal(
      resolveUserMessageDisplayText(message, { u1: "已改" }),
      "已改",
    );
  });

  it("upsertUserMessageDraft removes entry when unchanged", () => {
    const message = userMsg("u1", "same");
    const withDraft = upsertUserMessageDraft(message, "edited", {});
    assert.equal(withDraft.u1, "edited");
    const cleared = upsertUserMessageDraft(message, "same", withDraft);
    assert.equal(cleared.u1, undefined);
  });

  it("userMessageHasLocalDraft detects diff from committed text", () => {
    const message = userMsg("u1", "a");
    assert.equal(userMessageHasLocalDraft(message, {}), false);
    assert.equal(userMessageHasLocalDraft(message, { u1: "a" }), false);
    assert.equal(userMessageHasLocalDraft(message, { u1: "b" }), true);
  });
});
