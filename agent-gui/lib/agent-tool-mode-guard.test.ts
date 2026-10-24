import assert from "node:assert/strict";
import { test } from "node:test";
import { convertToModelMessages, generateText, tool, type ToolExecutionOptions, type UIMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import { applyToolModeGuards, getToolModeOperationDecision } from "./agent-tool-mode-guard";
import { applyToolCallPolicies } from "./agent-tool-policy";
import { selectSubagentTools } from "./task-tool-capabilities";
import { isStructuredToolResult } from "./tool-result";

const options = { toolCallId: "mode-test", messages: [] } as ToolExecutionOptions;

test("Ask rejects mixed-tool writes and unknown operations before the adapter", async () => {
  let adapterCalls = 0;
  const execute = async () => { adapterCalls += 1; return "adapter result"; };
  const tools = applyToolModeGuards({
    workspace_program: tool({ inputSchema: z.object({ action: z.string() }), execute }),
    quicker_settings: tool({ inputSchema: z.object({ action: z.string() }), execute }),
  }, "ask", { workspace_program: execute });
  for (const [id, action] of [
    ["workspace_program", "write_data"], ["workspace_program", "patch"],
    ["workspace_program", "file_edit"], ["workspace_program", "future_action"],
    ["quicker_settings", "set"], ["quicker_settings", "apply"],
    ["quicker_settings", "open"], ["quicker_settings", "future_action"],
  ]) {
    const result = await tools[id as keyof typeof tools].execute!({ action }, options);
    assert.ok(isStructuredToolResult(result));
    assert.equal(result.ok, false);
    assert.equal((result.data as { errorCode: string }).errorCode, "tool_mode_denied");
  }
  assert.equal(adapterCalls, 0);
  assert.equal(await tools.workspace_program.execute!({ action: "read_data" }, options), "adapter result");
  assert.equal(adapterCalls, 1);
});

test("Ask denies startup-capable remote reads before the adapter, including inherited and restored approvals", async () => {
  let adapterCalls = 0;
  const ids = [
    "qkrpc_wait", "qkrpc_action_query", "qkrpc_subprogram_query",
    "qkrpc_step_runner_search", "qkrpc_step_runner_get", "qkrpc_fa",
    "launcher_resolve", "quicker_settings", "workspace_program_diagnostics",
  ];
  const base = Object.fromEntries(ids.map((id) => [id, tool({
    inputSchema: z.object({ action: z.string().optional() }).passthrough(),
    needsApproval: true,
    execute: async () => { adapterCalls += 1; return "adapter"; },
  })]));
  const guarded = applyToolModeGuards(base, "ask");
  const parent = applyToolCallPolicies(guarded);
  const child = selectSubagentTools(parent, ids);
  for (const id of ids) {
    assert.equal(child[id], parent[id]);
    assert.equal(child[id].needsApproval, true);
    for (const input of [{}, { action: "get", noBootstrap: true, readOnly: true }]) {
      const result = await guarded[id].execute!(input, options);
      assert.ok(isStructuredToolResult(result));
      assert.equal(result.ok, false);
      assert.equal((result.data as { errorCode: string }).errorCode, "tool_mode_denied");
      assert.equal(result.retryable, false);
    }
    const inherited = await child[id].execute!({}, options);
    assert.ok(isStructuredToolResult(inherited));
    assert.equal((inherited.data as { errorCode: string }).errorCode, "tool_mode_denied");
  }

  const resumed = applyToolCallPolicies(guarded);
  const messages = await convertToModelMessages([{ id: "saved", role: "assistant", parts: ids.map((id) => ({
    type: `tool-${id}`, toolCallId: `saved-${id}`, state: "approval-responded",
    input: {}, approval: { id: `approval-${id}`, approved: true },
  })) }] as UIMessage[], { tools: resumed });
  let prompt = "";
  await generateText({ messages, tools: resumed, model: new MockLanguageModelV3({ doGenerate: async (input) => {
    prompt = JSON.stringify(input.prompt);
    return {
      content: [{ type: "text", text: "offline boundary" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [],
    };
  } }) });
  assert.match(prompt, /tool_mode_denied/);
  assert.equal(adapterCalls, 0);
  for (const mode of ["agent", "launcher"] as const) {
    assert.equal(applyToolModeGuards(base, mode), base);
    for (const id of ids) assert.equal(await base[id].execute!({}, options), "adapter");
  }
  assert.equal(adapterCalls, ids.length * 2);
});

test("Ask keeps local workspace observations but cannot enter remote diagnostics", async () => {
  const calls: string[] = [];
  const base = { workspace_program: tool({ inputSchema: z.object({ action: z.string() }),
    execute: async ({ action }) => { calls.push(action); return action; },
  }) };
  const unavailable = applyToolModeGuards(base, "ask");
  const missingPort = await unavailable.workspace_program.execute!({ action: "read_data" }, options);
  assert.ok(isStructuredToolResult(missingPort));
  assert.equal(missingPort.ok, false);
  assert.deepEqual(calls, []);
  const tools = applyToolModeGuards(base, "ask", { workspace_program: base.workspace_program.execute });
  const denied = await tools.workspace_program.execute!({ action: "diagnostics" }, options);
  assert.ok(isStructuredToolResult(denied));
  assert.equal(denied.ok, false);
  for (const action of ["projects_list", "read_data", "file_read", "file_info", "file_search"]) {
    assert.equal(await tools.workspace_program.execute!({ action }, options), action);
  }
  assert.deepEqual(calls, ["projects_list", "read_data", "file_read", "file_info", "file_search"]);
});

test("Agent keeps existing execution and inherited Ask guards cannot be widened", async () => {
  let writes = 0;
  const base = { workspace_program: tool({
    inputSchema: z.object({ action: z.string() }), execute: async () => ++writes,
  }) };
  const agent = applyToolModeGuards(base, "agent");
  assert.equal(await agent.workspace_program.execute!({ action: "patch" }, options), 1);
  const parent = applyToolCallPolicies(applyToolModeGuards(base, "ask"));
  const child = selectSubagentTools(parent, ["workspace_program"]);
  const denied = await child.workspace_program.execute!({ action: "patch" }, options);
  assert.ok(isStructuredToolResult(denied));
  assert.equal(denied.ok, false);
  assert.equal(writes, 1);
});

test("Ask browser rejects all dispatch until a side-effect-free observation adapter exists", async () => {
  const calls: unknown[] = [];
  const browser = tool({
    inputSchema: z.object({ action: z.string() }).passthrough(),
    execute: async (input) => { calls.push(input); return "observed"; },
  });
  const tools = applyToolModeGuards({ browser }, "ask");
  for (const action of [
    "navigate", "click", "click_xy", "type", "fill", "press", "evaluate",
    "scroll", "tab", "back", "forward", "reload", "close", "future_action",
    "status", "snapshot", "search", "content", "tabs", "wait",
  ]) {
    const result = await tools.browser.execute!({ action }, options);
    assert.ok(isStructuredToolResult(result));
    assert.equal(result.ok, false, `${action} must not execute in Ask`);
    assert.match(String(result.stderr), /may start a runtime or create a session/);
  }
  for (const input of [
    { action: "content", url: "https://example.test" },
    { action: "search", url: "https://example.test", text: "find" },
    { action: "snapshot", showPanel: true },
    { action: "status", script: "document.body.remove()" },
  ]) {
    const result = await tools.browser.execute!(input, options);
    assert.ok(isStructuredToolResult(result));
    assert.equal(result.ok, false);
  }
  assert.deepEqual(calls, []);
  const child = selectSubagentTools(tools, ["browser"]);
  const denied = await child.browser.execute!({ action: "evaluate", script: "1+1" }, options);
  assert.ok(isStructuredToolResult(denied));
  assert.equal(denied.ok, false);
  assert.equal(calls.length, 0);
  assert.equal(await applyToolModeGuards({ browser }, "agent").browser.execute!({ action: "navigate" }, options), "observed");
});

test("Ask program get requires explicit read ports and cannot replay the exporting executor", async () => {
  let exports = 0, reads = 0;
  const base = Object.fromEntries(["qkrpc_action_get", "qkrpc_subprogram_get"].map((id) => [id, tool({
    inputSchema: z.object({ id: z.string() }).passthrough(), needsApproval: true,
    execute: async () => { exports += 1; return "exported"; },
  })]));
  const denied = applyToolModeGuards(base, "ask");
  for (const definition of Object.values(denied)) {
    const result = await definition.execute!({ id: "fixture" }, options);
    assert.ok(isStructuredToolResult(result)); assert.equal(result.ok, false);
  }
  const parent = applyToolCallPolicies(applyToolModeGuards(base, "ask", {
    qkrpc_action_get: async () => { reads += 1; return "read"; },
    qkrpc_subprogram_get: async () => { reads += 1; return "read"; },
  }), { qkrpc_action_get: { maxCallsPerTurn: 1, maxIdenticalCallsPerTurn: 1 } });
  const child = selectSubagentTools(parent, ["qkrpc_action_get"]);
  assert.equal(child.qkrpc_action_get, parent.qkrpc_action_get);
  assert.equal(child.qkrpc_action_get.needsApproval, true);
  // An old approved payload or an inherited tool still executes the current mode's read port.
  assert.equal(await child.qkrpc_action_get.execute!({ id: "fixture", action: "export", readOnly: false }, options), "read");
  const exhausted = await parent.qkrpc_action_get.execute!({ id: "other" }, options);
  assert.ok(isStructuredToolResult(exhausted)); assert.equal(exhausted.ok, false);
  assert.equal(await parent.qkrpc_subprogram_get.execute!({ id: "fixture" }, options), "read");
  assert.equal(reads, 2); assert.equal(exports, 0);
  assert.equal(await applyToolModeGuards(base, "agent").qkrpc_action_get.execute!({ id: "fixture" }, options), "exported");
  assert.equal(exports, 1);
});

test("Ask client read ports remain client tools through the actual SDK and never call a disk executor", async () => {
  let diskReads = 0;
  const client = tool({ inputSchema: z.object({ action: z.literal("read_live") }) });
  const operationConstraints = { workspace_program: { allowedActions: ["read_live", "edit_live"] } };
  const guarded = applyToolModeGuards({ workspace_program: client }, "ask", {
    workspace_program: async () => { diskReads++; return "disk"; },
  }, { clientReadonlyTools: ["workspace_program"], operationConstraints });
  assert.equal(guarded.workspace_program, client);
  assert.equal(guarded.workspace_program.execute, undefined);
  assert.deepEqual(selectSubagentTools(guarded, ["workspace_program"]), {});
  assert.equal(getToolModeOperationDecision("workspace_program", "ask", { action: "read_live" }, true, operationConstraints.workspace_program).allowed, true);
  for (const action of ["edit_live", "read_data", "patch", "future_action"]) {
    assert.equal(getToolModeOperationDecision("workspace_program", "ask", { action }, true, operationConstraints.workspace_program).allowed, false);
  }
  const result = await generateText({
    prompt: "Read the live document", tools: guarded,
    model: new MockLanguageModelV3({ doGenerate: async () => ({
      content: [{ type: "tool-call", toolCallId: "live-read", toolName: "workspace_program", input: '{"action":"read_live"}' }],
      finishReason: { unified: "tool-calls", raw: "tool-calls" },
      usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [],
    }) }),
  });
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolResults.length, 0, "the SDK leaves the client call for addToolOutput");
  assert.equal(diskReads, 0);
});

test("per-turn operation constraints reject old disk operations before Agent execution", async () => {
  const calls: string[] = [];
  const tools = applyToolModeGuards({ workspace_program: tool({ inputSchema: z.object({ action: z.string() }),
    execute: async ({ action }) => { calls.push(action); return { action }; },
  }) }, "agent", {}, { operationConstraints: { workspace_program: { allowedActions: ["read_live", "edit_live"] } } });
  for (const action of ["read_data", "write_data", "file_read", "patch", "future_action"]) {
    const result = await tools.workspace_program.execute!({ action }, options);
    assert.ok(isStructuredToolResult(result)); assert.equal(result.ok, false);
  }
  assert.deepEqual(calls, []);
  await tools.workspace_program.execute!({ action: "edit_live" }, options);
  assert.deepEqual(calls, ["edit_live"]);
});
