import assert from "node:assert/strict";
import { test } from "node:test";
import type { ToolExecutionOptions } from "ai";
import { createStepRunnerKnowledgeTools } from "./step-runner-knowledge-tools.server";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { createTurnExecutionState, disposeTurnExecutionState } from "./agent-harness/turn-execution-state";
import { formatLocalToolResult, isStructuredToolResult } from "./tool-result";

const options = { toolCallId: "knowledge-fixture", messages: [] } as ToolExecutionOptions;
function schema(name: string) {
  return formatLocalToolResult({ action: "step-runner-get", payload: {
    success: true, schemaJson: JSON.stringify({ StepRunnerKey: "sys:fixture", Name: name }),
  } });
}

test("the same conversation fetches changed native schema in a later turn", async () => {
  let calls = 0;
  const tools = createStepRunnerKnowledgeTools(async () => schema(++calls === 1 ? "old definition" : "new definition"));
  const firstOwner = createTurnExecutionState();
  const first = await runWithAgentRequestContextAsync({ threadId: "same-thread", executionState: firstOwner },
    () => tools.qkrpc_step_runner_get.execute!({ key: "sys:fixture" }, options));
  disposeTurnExecutionState(firstOwner);
  const second = await runWithAgentRequestContextAsync({ threadId: "same-thread", executionState: createTurnExecutionState() },
    () => tools.qkrpc_step_runner_get.execute!({ key: "sys:fixture" }, options));
  assert.equal(calls, 2);
  assert.match(JSON.stringify(first), /old definition/);
  assert.match(JSON.stringify(second), /new definition/);
  assert.doesNotMatch(JSON.stringify(second), /Duplicate get|old definition/);
});

test("a native definition change within one turn is fetched without a fabricated revision", async () => {
  let calls = 0;
  const tools = createStepRunnerKnowledgeTools(async () => schema(`live definition ${++calls}`));
  await runWithAgentRequestContextAsync({ threadId: "same-turn" }, async () => {
    await tools.qkrpc_step_runner_get.execute!({ key: "sys:fixture" }, options);
    const current = await tools.qkrpc_step_runner_get.execute!({ key: "sys:fixture" }, options);
    assert.match(JSON.stringify(current), /live definition 2/);
  });
  assert.equal(calls, 2);
});

test("search keeps the requested result limit and permits fresh discovery after module removal", async () => {
  const calls: string[][] = [];
  const tools = createStepRunnerKnowledgeTools(async (args) => {
    calls.push([...args]);
    return formatLocalToolResult({ action: "step-runner-search", payload: {
      success: true, matchCount: calls.length === 1 ? 1 : 0, items: [],
    } });
  });
  await runWithAgentRequestContextAsync({ threadId: "same-search", lastUserText: "读取剪贴板并写回" }, async () => {
    await tools.qkrpc_step_runner_search.execute!({ query: "fixture", limit: 1 }, options);
    await tools.qkrpc_step_runner_search.execute!({ query: "fixture", limit: 20 }, options);
    await tools.qkrpc_step_runner_search.execute!({ query: "replacement" }, options);
  });
  assert.deepEqual(calls, [
    ["step-runner", "search", "--query", "fixture", "--limit", "1"],
    ["step-runner", "search", "--query", "fixture", "--limit", "20"],
    ["step-runner", "search", "--query", "replacement"],
  ]);
});

test("native control values retain case, whitespace and explicit empty values", async () => {
  const calls: string[][] = [];
  const tools = createStepRunnerKnowledgeTools(async (args) => { calls.push([...args]); return schema("control"); });
  for (const controlField of ["Mode", "mode", " ", ""]) {
    await tools.qkrpc_step_runner_get.execute!({ key: "sys:fixture", controlField }, options);
  }
  assert.deepEqual(calls.map((args) => args.at(-1)), ["Mode", "mode", " ", ""]);
  assert.ok(calls.every((args) => args.at(-2) === "--control-field"));
});

test("an unavailable current schema cannot be replaced by an older successful result", async () => {
  let calls = 0;
  const tools = createStepRunnerKnowledgeTools(async () => ++calls === 1 ? schema("old schema")
    : formatLocalToolResult({ action: "step-runner-get", payload: { success: false, errorMessage: "module removed" } }, false, "module removed"));
  await runWithAgentRequestContextAsync({ threadId: "same-failure" }, async () => {
    await tools.qkrpc_step_runner_get.execute!({ key: "sys:fixture" }, options);
    const failed = await tools.qkrpc_step_runner_get.execute!({ key: "sys:fixture" }, options);
    assert.ok(isStructuredToolResult(failed));
    assert.equal(failed.ok, false);
    assert.match(JSON.stringify(failed), /module removed/);
    assert.doesNotMatch(JSON.stringify(failed), /old schema|Duplicate get/);
  });
  assert.equal(calls, 2);
});

test("an old turn's late native result cannot poison a newer turn on the same conversation", async () => {
  let calls = 0;
  let releaseOld!: (value: ReturnType<typeof schema>) => void;
  const oldRead = new Promise<ReturnType<typeof schema>>((resolve) => { releaseOld = resolve; });
  const tools = createStepRunnerKnowledgeTools(async () => ++calls === 1 ? oldRead : schema("current definition"));
  const oldOwner = createTurnExecutionState();
  const pending = runWithAgentRequestContextAsync({ threadId: "shared-thread", executionState: oldOwner },
    () => tools.qkrpc_step_runner_get.execute!({ key: "sys:fixture" }, options));
  disposeTurnExecutionState(oldOwner);
  const currentOwner = createTurnExecutionState();
  const readCurrent = () => runWithAgentRequestContextAsync({ threadId: "shared-thread", executionState: currentOwner },
    () => tools.qkrpc_step_runner_get.execute!({ key: "sys:fixture" }, options));
  assert.match(JSON.stringify(await readCurrent()), /current definition/);
  releaseOld(schema("obsolete definition"));
  await pending;
  const afterLate = await readCurrent();
  assert.match(JSON.stringify(afterLate), /current definition/);
  assert.doesNotMatch(JSON.stringify(afterLate), /obsolete definition/);
  assert.equal(calls, 3);
  disposeTurnExecutionState(currentOwner);
});
