import assert from "node:assert/strict";
import { test } from "node:test";
import { canCommitChatMessageEditBranch, prepareChatMessageEditBranch, replaceChatMessagesIfCurrent, type ChatMessageEditBranchContext } from "./chat-message-edit-branch";

const context = (): ChatMessageEditBranchContext => ({ owner: {}, threadId: "a", visible: true, anchorMessageId: "u1",
  messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "original" }] },
    { id: "a1", role: "assistant", parts: [{ type: "text", text: "answer" }] }], composerText: " revised " });

test("branch preparation keeps the SDK revision and existing slice/trim/count semantics", () => {
  const current = context();
  const branch = prepareChatMessageEditBranch(current)!;
  assert.equal(branch.messages, current.messages);
  assert.equal(branch.anchorIndex, 0);
  assert.equal(branch.removedCount, 2);
  assert.equal(branch.text, "revised");
  assert.equal(canCommitChatMessageEditBranch(branch, current), true);
  for (const change of [{ visible: false }, { anchorMessageId: null }, { anchorMessageId: "a1" }, { composerText: " " }]) {
    assert.equal(prepareChatMessageEditBranch({ ...current, ...change }), undefined);
  }
});

test("late confirmation cannot cross owner, visibility, anchor, draft or SDK message revision", () => {
  const current = context();
  const branch = prepareChatMessageEditBranch(current)!;
  for (const change of [{ owner: {} }, { threadId: "b" }, { visible: false }, { anchorMessageId: "u2" },
    { composerText: "newer draft" }, { messages: [...current.messages] }]) {
    assert.equal(canCommitChatMessageEditBranch(branch, { ...current, ...change }), false);
  }
  assert.equal(canCommitChatMessageEditBranch(branch, { ...current, composerText: "revised" }), true);
});

test("branch replacement uses the live SDK store and preserves prefix objects and metadata", () => {
  const rendered = context().messages;
  rendered[0]!.metadata = { fixture: "preserved" } as never;
  let sdk = rendered;
  const set = (update: (current: typeof sdk) => typeof sdk) => { sdk = update(sdk); };
  const prefix = rendered.slice(0, 1);
  sdk = [...sdk, { id: "late", role: "assistant", parts: [] }];
  assert.equal(replaceChatMessagesIfCurrent(set, rendered, prefix), false);
  assert.equal(sdk.length, 3);
  const latest = sdk;
  assert.equal(replaceChatMessagesIfCurrent(set, latest, prefix), true);
  assert.equal(sdk, prefix);
  assert.equal(sdk[0], rendered[0]);
  assert.deepEqual(sdk[0]!.metadata, { fixture: "preserved" });
});

test("an incompatible deferred setter fails closed without changing messages later", () => {
  const rendered = context().messages;
  let deferred: ((current: typeof rendered) => typeof rendered) | undefined;
  assert.equal(replaceChatMessagesIfCurrent((update) => { deferred = update; }, rendered, []), false);
  assert.equal(deferred!(rendered), rendered);
});
