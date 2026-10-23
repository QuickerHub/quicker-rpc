import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getRequestTurnExecutionState,
  qkrpcRequestContext,
  runWithAgentRequestContext,
  runWithAgentRequestContextAsync,
  runWithQkrpcCwdAsync,
} from "./qkrpc-request-context.ts";
import {
  isEmptyProgramDataContent,
  incrementProgramEditAfterPatchCount,
  markActionCreatedThisTurn,
  markProgramDataEditedThisTurn,
  markProgramPatchedThisTurn,
  mustWriteDataAfterCreateThisTurn,
  getCreatedActionIdThisTurn,
  wasProgramPatchedThisTurn,
  wasActionCreatedThisTurn,
  wasProgramDataEditedThisTurn,
  incrementDocsCallCountThisTurn,
  getDocsCallCountThisTurn,
  incrementStepRunnerSearchCountThisTurn,
  getStepRunnerSearchCountThisTurn,
  clearProgramTurnFlagsForThread,
} from "./program-turn-context.ts";
import {
  isQkrpcConnectivityBlockedThisTurn,
  markQkrpcConnectivityBlockedThisTurn,
  clearQkrpcConnectivityBlockedThisTurn,
} from "./qkrpc-connectivity-gate";
import { createTurnExecutionState, disposeTurnExecutionState } from "./agent-harness/turn-execution-state";

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

test("nested tool contexts share updates back to their parent and sibling", async () => {
  await qkrpcRequestContext.run({ threadId: "shared-owner" }, async () => {
    // A raw legacy context must acquire the state before its first nested clone.
    await runWithAgentRequestContextAsync({ cwd: "/fixture/tool" }, async () => {
      markActionCreatedThisTurn("owned-action");
      incrementDocsCallCountThisTurn();
      markQkrpcConnectivityBlockedThisTurn();
    });
    const state = getRequestTurnExecutionState();
    assert.equal(getCreatedActionIdThisTurn(), "owned-action");
    assert.equal(mustWriteDataAfterCreateThisTurn(), true);
    assert.equal(getDocsCallCountThisTurn(), 1);
    assert.equal(isQkrpcConnectivityBlockedThisTurn(), true);

    await runWithQkrpcCwdAsync("/fixture/subagent", async () => {
      assert.equal(getRequestTurnExecutionState(), state);
      markProgramDataEditedThisTurn();
      markProgramPatchedThisTurn();
      incrementStepRunnerSearchCountThisTurn();
      incrementDocsCallCountThisTurn();
      clearQkrpcConnectivityBlockedThisTurn();
    });
    assert.equal(mustWriteDataAfterCreateThisTurn(), false);
    assert.equal(wasProgramPatchedThisTurn(), true);
    assert.equal(incrementProgramEditAfterPatchCount(), 1);
    assert.equal(getDocsCallCountThisTurn(), 2);
    assert.equal(getStepRunnerSearchCountThisTurn(), 1);
    assert.equal(isQkrpcConnectivityBlockedThisTurn(), false);
  });
});

test("same thread contexts own independent state and compatibility clears stay local", async () => {
  const first = createTurnExecutionState();
  const second = createTurnExecutionState();
  await runWithAgentRequestContextAsync({ threadId: "same-thread", executionState: first }, async () => {
    markActionCreatedThisTurn("first-action");
    incrementDocsCallCountThisTurn();
    markQkrpcConnectivityBlockedThisTurn();
    await runWithAgentRequestContextAsync({ threadId: "same-thread", executionState: second }, async () => {
      assert.equal(wasActionCreatedThisTurn(), false);
      markActionCreatedThisTurn("second-action");
      clearProgramTurnFlagsForThread("same-thread");
      assert.equal(wasActionCreatedThisTurn(), false);
      assert.equal(isQkrpcConnectivityBlockedThisTurn(), false);
    });
    assert.equal(getCreatedActionIdThisTurn(), "first-action");
    assert.equal(getDocsCallCountThisTurn(), 1);
    assert.equal(isQkrpcConnectivityBlockedThisTurn(), true);
  });
});

test("closed owners ignore late writes and retain no execution facts", () => {
  const state = createTurnExecutionState();
  runWithAgentRequestContext({ executionState: state }, () => {
    markActionCreatedThisTurn("old-action");
    incrementDocsCallCountThisTurn();
    markQkrpcConnectivityBlockedThisTurn();
    disposeTurnExecutionState(state);
    markActionCreatedThisTurn("late-action");
    markProgramDataEditedThisTurn();
    markProgramPatchedThisTurn();
    incrementDocsCallCountThisTurn();
    incrementStepRunnerSearchCountThisTurn();
    markQkrpcConnectivityBlockedThisTurn();
    assert.deepEqual(state, { closed: true });
    assert.equal(getCreatedActionIdThisTurn(), undefined);
    assert.equal(wasActionCreatedThisTurn(), false);
    assert.equal(wasProgramDataEditedThisTurn(), false);
    assert.equal(wasProgramPatchedThisTurn(), false);
    assert.equal(isQkrpcConnectivityBlockedThisTurn(), false);
  });
});

test("without ALS all mark/get APIs use a stateless fallback", () => {
  assert.equal(getRequestTurnExecutionState(), undefined);
  markActionCreatedThisTurn("unowned-action");
  markProgramDataEditedThisTurn();
  markProgramPatchedThisTurn();
  markQkrpcConnectivityBlockedThisTurn();
  assert.equal(incrementDocsCallCountThisTurn(), 1);
  assert.equal(incrementDocsCallCountThisTurn(), 1);
  assert.equal(incrementStepRunnerSearchCountThisTurn(), 1);
  assert.equal(incrementProgramEditAfterPatchCount(), 0);
  assert.equal(getDocsCallCountThisTurn(), 0);
  assert.equal(getStepRunnerSearchCountThisTurn(), 0);
  assert.equal(getCreatedActionIdThisTurn(), undefined);
  assert.equal(mustWriteDataAfterCreateThisTurn(), false);
  assert.equal(wasActionCreatedThisTurn(), false);
  assert.equal(wasProgramDataEditedThisTurn(), false);
  assert.equal(wasProgramPatchedThisTurn(), false);
  assert.equal(isQkrpcConnectivityBlockedThisTurn(), false);
});
