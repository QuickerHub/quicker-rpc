import assert from "node:assert/strict";
import { test } from "node:test";

import { qkrpcRequestContext, runWithAgentRequestContext } from "./qkrpc-request-context.ts";
import {
  isEmptyProgramDataContent,
  incrementProgramEditAfterPatchCount,
  markActionCreatedThisTurn,
  markProgramDataEditedThisTurn,
  markProgramPatchedThisTurn,
  mustWriteDataAfterCreateThisTurn,
  getCreatedActionIdThisTurn,
  wasProgramPatchedThisTurn,
} from "./program-turn-context.ts";

test("isEmptyProgramDataContent detects empty steps array", () => {
  assert.equal(isEmptyProgramDataContent('{"steps":[],"variables":[]}'), true);
  assert.equal(
    isEmptyProgramDataContent('{"steps":[{"key":"x"}],"variables":[]}'),
    false,
  );
  assert.equal(isEmptyProgramDataContent(undefined), true);
});

test("mustWriteDataAfterCreateThisTurn until program data edited", () => {
  qkrpcRequestContext.run({ threadId: "t1" }, () => {
    assert.equal(mustWriteDataAfterCreateThisTurn(), false);
    markActionCreatedThisTurn();
    assert.equal(mustWriteDataAfterCreateThisTurn(), true);
    markProgramDataEditedThisTurn();
    assert.equal(mustWriteDataAfterCreateThisTurn(), false);
  });
});

test("getCreatedActionIdThisTurn stores action id", () => {
  qkrpcRequestContext.run({ threadId: "t-create" }, () => {
    markActionCreatedThisTurn("abc-123");
    assert.equal(getCreatedActionIdThisTurn(), "abc-123");
  });
});

test("program turn flags persist across nested agent request contexts", () => {
  qkrpcRequestContext.run({ threadId: "t-nested" }, () => {
    markActionCreatedThisTurn();
    runWithAgentRequestContext({ cwd: "/tmp" }, () => {
      assert.equal(mustWriteDataAfterCreateThisTurn(), true);
    });
  });
});

test("editAfterPatch count resets on new patch", () => {
  qkrpcRequestContext.run({ threadId: "t-edit-after-patch" }, () => {
    assert.equal(incrementProgramEditAfterPatchCount(), 0);
    markProgramPatchedThisTurn();
    assert.equal(wasProgramPatchedThisTurn(), true);
    assert.equal(incrementProgramEditAfterPatchCount(), 1);
    assert.equal(incrementProgramEditAfterPatchCount(), 2);
    markProgramPatchedThisTurn();
    assert.equal(incrementProgramEditAfterPatchCount(), 1);
  });
});