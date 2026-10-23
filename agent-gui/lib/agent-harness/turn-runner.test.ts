import assert from "node:assert/strict";
import test from "node:test";
import { createAgentTurnRunner, type AgentTurnServices } from "./turn-runner";
import { syntheticTurn } from "./turn-test-fixtures";
import { getRequestAbortSignal, getRequestTurnExecutionState, runWithAgentRequestContextAsync, runWithQkrpcCwdAsync } from "@/lib/qkrpc-request-context";
import {
  clearProgramTurnFlagsForThread,
  getCreatedActionIdThisTurn,
  getDocsCallCountThisTurn,
  incrementDocsCallCountThisTurn,
  markActionCreatedThisTurn,
  markProgramDataEditedThisTurn,
  mustWriteDataAfterCreateThisTurn,
  wasActionCreatedThisTurn,
} from "@/lib/program-turn-context";
import {
  isQkrpcConnectivityBlockedThisTurn,
  markQkrpcConnectivityBlockedThisTurn,
} from "@/lib/qkrpc-connectivity-gate";
import type { TurnExecutionState } from "./turn-execution-state";

function fixture(overrides: Partial<AgentTurnServices> = {}) {
  const data = syntheticTurn();
  let disposed = 0;
  const services: AgentTurnServices = {
    resolveRequest: async () => data.request,
    tryDirectResponse: async () => null,
    resolveModel: async () => ({ model: data.model, modelId: "fixture" }),
    resolveScope: async (_request, _signal, executionState) => ({
      ...data.scope,
      toolExecutionContext: { ...data.scope.toolExecutionContext, executionState },
    }),
    prepareRuntime: async () => ({ ...data.runtime, dispose: async () => { disposed += 1; } }),
    runLoop: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id: "text" });
      writer.write({ type: "text-delta", id: "text", delta: "complete output" });
      writer.write({ type: "text-end", id: "text" });
      writer.write({ type: "finish" });
    },
    withContext: runWithAgentRequestContextAsync,
    ...overrides,
  };
  return { ...data, services, run: createAgentTurnRunner(services), disposed: () => disposed };
}

test("normal turn drains all buffered UI chunks and disposes its runtime once", async () => {
  const turn = fixture();
  const response = await turn.run(turn.request.body);
  assert.match(await response.text(), /complete output/);
  assert.equal(turn.disposed(), 1);
});

test("cleanup and diagnostic observer failures do not replace a completed stream", async () => {
  let closeCalls = 0;
  let diagnostics = 0;
  const turn = fixture({
    prepareRuntime: async () => ({
      ...turn.runtime,
      dispose: async () => { closeCalls += 1; throw new Error("fixture cleanup failed"); },
    }),
    onCleanupError: () => { diagnostics += 1; throw new Error("fixture observer failed"); },
  });
  const response = await turn.run(turn.request.body);
  const body = await response.text();
  assert.match(body, /complete output/);
  assert.match(body, /\[DONE\]/);
  assert.doesNotMatch(body, /"type":"error"/);
  assert.equal(closeCalls, 1);
  assert.ok(diagnostics >= 1);
});

test("already cancelled request never resolves config or starts a model", async () => {
  let resolved = false;
  const turn = fixture({ resolveRequest: async () => { resolved = true; throw new Error("must not run"); } });
  const parent = new AbortController();
  parent.abort();
  await assert.rejects(turn.run(turn.request.body, { abortSignal: parent.signal }), { name: "AbortError" });
  assert.equal(resolved, false);
});

test("cancellation during preparation releases a late runtime without starting its loop", async () => {
  const parent = new AbortController();
  let loopCalls = 0;
  let released = 0;
  const turn = fixture({
    prepareRuntime: async () => {
      parent.abort();
      return { ...turn.runtime, dispose: async () => { released += 1; } };
    },
    runLoop: async () => { loopCalls += 1; },
  });
  await assert.rejects(turn.run(turn.request.body, { abortSignal: parent.signal }), { name: "AbortError" });
  assert.equal(loopCalls, 0);
  assert.equal(released, 1);
});

test("response body cancellation reaches the active loop and nested tool contexts", async () => {
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  let loopSignal: AbortSignal | undefined;
  let executionState: TurnExecutionState | undefined;
  const turn = fixture({ runLoop: async ({ abortSignal }) => {
    loopSignal = abortSignal;
    executionState = getRequestTurnExecutionState();
    markActionCreatedThisTurn("cancelled-action");
    await runWithQkrpcCwdAsync("nested-fixture", async () => {
      assert.equal(getRequestAbortSignal(), abortSignal);
    });
    started();
    await new Promise<void>((resolve) => abortSignal!.addEventListener("abort", () => resolve(), { once: true }));
  } });
  const response = await turn.run(turn.request.body);
  await ready;
  await response.body!.cancel("stop button");
  assert.equal(loopSignal?.aborted, true);
  assert.equal(loopSignal?.reason, "stop button");
  assert.equal(turn.disposed(), 1);
  assert.deepEqual(executionState, { closed: true });
  assert.equal(getRequestTurnExecutionState(), undefined);
});

test("model configuration error returns without preparing runtime", async () => {
  let prepared = false;
  const turn = fixture({
    resolveModel: async () => Response.json({ error: "fixture config missing" }, { status: 400 }),
    prepareRuntime: async () => { prepared = true; throw new Error("must not run"); },
  });
  assert.equal((await turn.run(turn.request.body)).status, 400);
  assert.equal(prepared, false);
});

test("cancelling one concurrent turn leaves the other running", async () => {
  let started = 0;
  let ready!: () => void;
  const bothStarted = new Promise<void>((resolve) => { ready = resolve; });
  const signals: AbortSignal[] = [];
  const turn = fixture({ runLoop: async ({ abortSignal }) => {
    signals.push(abortSignal!);
    if (++started === 2) ready();
    await new Promise<void>((resolve) => abortSignal!.addEventListener("abort", () => resolve(), { once: true }));
  } });
  const first = await turn.run(turn.request.body);
  const second = await turn.run(turn.request.body);
  await bothStarted;
  await first.body!.cancel("first stopped");
  assert.equal(signals[0]!.aborted, true);
  assert.equal(signals[1]!.aborted, false);
  await second.body!.cancel("second stopped");
  assert.equal(turn.disposed(), 2);
});

test("direct launcher response cancellation also owns a turn signal", async () => {
  let signal: AbortSignal | undefined;
  let cancelled = false;
  const turn = fixture({ tryDirectResponse: async () => {
    signal = getRequestAbortSignal();
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  } });
  const response = await turn.run(turn.request.body);
  await response.body!.cancel();
  assert.equal(signal?.aborted, true);
  assert.equal(cancelled, true);
});

test("a direct response acquired after cancellation releases its body", async () => {
  const parent = new AbortController();
  let cancelled = 0;
  const turn = fixture({ tryDirectResponse: async () => {
    parent.abort();
    return new Response(new ReadableStream({ cancel() { cancelled += 1; } }));
  } });
  await assert.rejects(turn.run(turn.request.body, { abortSignal: parent.signal }), { name: "AbortError" });
  assert.equal(cancelled, 1);
});

test("nested explicit signal cannot replace an already cancelled owning turn", async () => {
  const parent = new AbortController();
  const nested = new AbortController();
  parent.abort();
  await runWithAgentRequestContextAsync({ abortSignal: parent.signal }, async () => {
    await runWithAgentRequestContextAsync({ abortSignal: nested.signal }, async () => {
      assert.equal(getRequestAbortSignal()?.aborted, true);
      assert.equal(getRequestAbortSignal()?.reason, parent.signal.reason);
    });
  });
});

test("concurrent root turns in one thread never share or clear execution facts", async () => {
  let started = 0;
  let bothReady!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { bothReady = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  const states: TurnExecutionState[] = [];
  const turn = fixture({ runLoop: async () => {
    const index = started++;
    const state = getRequestTurnExecutionState()!;
    states[index] = state;
    assert.equal(wasActionCreatedThisTurn(), false);
    assert.equal(getDocsCallCountThisTurn(), 0);
    markActionCreatedThisTurn(`owned-${index}`);
    incrementDocsCallCountThisTurn();
    if (index === 0) markQkrpcConnectivityBlockedThisTurn();
    if (index === 1) {
      clearProgramTurnFlagsForThread(turn.request.threadId);
      assert.equal(wasActionCreatedThisTurn(), false);
    }
    if (started === 2) bothReady();
    await released;
    if (index === 0) {
      assert.equal(getCreatedActionIdThisTurn(), "owned-0");
      assert.equal(getDocsCallCountThisTurn(), 1);
      assert.equal(isQkrpcConnectivityBlockedThisTurn(), true);
    } else {
      assert.equal(wasActionCreatedThisTurn(), false);
      assert.equal(isQkrpcConnectivityBlockedThisTurn(), false);
    }
  } });
  const first = await turn.run(turn.request.body);
  const second = await turn.run(turn.request.body);
  await ready;
  assert.notEqual(states[0], states[1]);
  release();
  await Promise.all([first.text(), second.text()]);
  assert.deepEqual(states, [{ closed: true }, { closed: true }]);
  assert.equal(getRequestTurnExecutionState(), undefined);
});

test("each later root turn receives fresh facts and propagates its explicit owner", async () => {
  const states: TurnExecutionState[] = [];
  const turn = fixture({
    tryDirectResponse: async () => {
      states.push(getRequestTurnExecutionState()!);
      assert.equal(wasActionCreatedThisTurn(), false);
      assert.equal(isQkrpcConnectivityBlockedThisTurn(), false);
      markActionCreatedThisTurn(`owned-${states.length}`);
      return null;
    },
    resolveScope: async (_request, _signal, executionState) => {
      assert.equal(executionState, states.at(-1));
      assert.equal(executionState, getRequestTurnExecutionState());
      return { ...turn.scope, toolExecutionContext: { ...turn.scope.toolExecutionContext, executionState } };
    },
    runLoop: async () => {
      assert.equal(getRequestTurnExecutionState(), states.at(-1));
      assert.equal(mustWriteDataAfterCreateThisTurn(), true);
      await runWithAgentRequestContextAsync({ cwd: "fixture-subagent" }, async () => {
        markProgramDataEditedThisTurn();
      });
      assert.equal(mustWriteDataAfterCreateThisTurn(), false);
    },
  });
  await (await turn.run(turn.request.body)).text();
  assert.deepEqual(states[0], { closed: true });
  await (await turn.run(turn.request.body)).text();
  assert.notEqual(states[0], states[1]);
  assert.deepEqual(states[1], { closed: true });
});

test("preparation failure disposes its state and restores the caller context", async () => {
  let failedState: TurnExecutionState | undefined;
  const failure = new Error("synthetic preparation failed");
  const turn = fixture({ prepareRuntime: async () => {
    failedState = getRequestTurnExecutionState();
    markActionCreatedThisTurn("failed-action");
    markQkrpcConnectivityBlockedThisTurn();
    throw failure;
  } });
  await runWithAgentRequestContextAsync({ threadId: turn.request.threadId }, async () => {
    const callerState = getRequestTurnExecutionState();
    markActionCreatedThisTurn("caller-action");
    await assert.rejects(turn.run(turn.request.body), (error: unknown) => error === failure);
    assert.equal(getRequestTurnExecutionState(), callerState);
    assert.equal(getCreatedActionIdThisTurn(), "caller-action");
    assert.notEqual(failedState, callerState);
  });
  assert.deepEqual(failedState, { closed: true });
  assert.equal(getRequestTurnExecutionState(), undefined);
  assert.equal(getCreatedActionIdThisTurn(), undefined);
});
