import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findLastUserTurnStartIndex,
  findUserTurnStartIndices,
} from "./last-user-turn-index.ts";

test("findUserTurnStartIndices returns every user index", () => {
  const messages = [
    { id: "a", role: "user" as const },
    { id: "b", role: "assistant" as const },
    { id: "c", role: "user" as const },
    { id: "d", role: "assistant" as const },
  ];
  assert.deepEqual(findUserTurnStartIndices(messages), [0, 2]);
});

test("findLastUserTurnStartIndex returns last user index", () => {
  const messages = [
    { id: "a", role: "user" as const },
    { id: "b", role: "assistant" as const },
    { id: "c", role: "user" as const },
    { id: "d", role: "assistant" as const },
  ];
  assert.equal(findLastUserTurnStartIndex(messages), 2);
});

test("findLastUserTurnStartIndex returns -1 when no user", () => {
  assert.equal(
    findLastUserTurnStartIndex([{ id: "a", role: "assistant" as const }]),
    -1,
  );
});
