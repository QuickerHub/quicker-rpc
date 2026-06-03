import assert from "node:assert/strict";
import { test } from "node:test";
import { getLastUserMessageId } from "./last-user-message-id.ts";

test("getLastUserMessageId returns last user role message", () => {
  const messages = [
    { id: "a", role: "user" },
    { id: "b", role: "assistant" },
    { id: "c", role: "user" },
  ];
  assert.equal(getLastUserMessageId(messages), "c");
  assert.equal(getLastUserMessageId([{ id: "x", role: "assistant" }]), null);
});
