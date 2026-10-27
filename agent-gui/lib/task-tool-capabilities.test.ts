import assert from "node:assert/strict";
import { test } from "node:test";
import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";
import { selectSubagentTools } from "./task-tool-capabilities";
import { applyToolCallPolicies } from "./agent-tool-policy";
import { isStructuredToolResult } from "./tool-result";
import { bindCurrentToolCatalog, currentToolCatalogForExecution } from "./current-tool-catalog";
import { executeListToolsTool } from "./list-tools-tool-execute";

const options = { toolCallId: "test-call", messages: [] } as ToolExecutionOptions;

function catalogTool(observe?: (options: ToolExecutionOptions) => void) {
  return tool({ inputSchema: z.object({ action: z.enum(["index", "get", "routing", "bundles", "bundle"]), toolId: z.string().optional() }),
    execute: (input, invocation) => {
      observe?.(invocation);
      return executeListToolsTool(input, currentToolCatalogForExecution(invocation));
    } });
}

test("each child catalog sees only its own final tools while sharing parent call limits", async () => {
  let executions = 0;
  const seenOptions: ToolExecutionOptions[] = [];
  const invocation = { ...options, toolCallId: "owned-child-catalog", abortSignal: new AbortController().signal };
  const read = tool({ description: "Current read", inputSchema: z.object({}), execute: async () => ++executions });
  const parent = bindCurrentToolCatalog(applyToolCallPolicies({ Read: read, Write: read, list_tools: catalogTool(value => seenOptions.push(value)),
    workspace_program: tool({ inputSchema: z.object({ action: z.literal("read_live") }) }),
  }, { list_tools: { maxCallsPerTurn: 3, maxIdenticalCallsPerTurn: 3 } }), { mode: "agent" });
  const first = selectSubagentTools(parent, ["Read", "list_tools", "workspace_program"]);
  const second = selectSubagentTools(parent, ["Write", "list_tools"]);
  const [firstCatalog, secondCatalog] = await Promise.all([
    first.list_tools.execute!({ action: "index" }, invocation),
    second.list_tools.execute!({ action: "index" }, invocation),
  ]);
  for (const result of [firstCatalog, secondCatalog]) assert.ok(isStructuredToolResult(result));
  assert.deepEqual((firstCatalog.data as { toolIds: string[] }).toolIds, ["Read", "list_tools"]);
  assert.deepEqual((secondCatalog.data as { toolIds: string[] }).toolIds, ["Write", "list_tools"]);
  const parentCatalog = await parent.list_tools.execute!({ action: "index" }, invocation);
  assert.ok(isStructuredToolResult(parentCatalog));
  assert.ok((parentCatalog.data as { toolIds: string[] }).toolIds.includes("workspace_program"));
  const exhausted = await first.list_tools.execute!({ action: "get", toolId: "Read" }, invocation);
  assert.ok(isStructuredToolResult(exhausted)); assert.equal(exhausted.ok, false);
  assert.equal((exhausted.data as { errorCode: string }).errorCode, "tool_call_limit");
  assert.equal(executions, 0);
  assert.equal(first.Read, parent.Read); assert.equal(second.Write, parent.Write);
  assert.equal(seenOptions.length, 3, "The exhausted parent gate must not enter discovery again");
  for (const received of seenOptions) {
    assert.equal(received.abortSignal, invocation.abortSignal);
    assert.equal(received.toolCallId, invocation.toolCallId);
    assert.equal(received.messages, invocation.messages);
  }
  assert.equal(Reflect.ownKeys(invocation).some(key => typeof key === "symbol"), false, "Binding must not mutate SDK options");
});

test("subagent can only narrow effective parent capabilities and cannot recurse", () => {
  const parent = { Read: tool({ inputSchema: z.object({}), execute: async () => "read" }), task: tool({ inputSchema: z.object({}) }) };
  assert.deepEqual(Object.keys(selectSubagentTools(parent, undefined)), ["Read"]);
  assert.deepEqual(selectSubagentTools(parent, []), {});
  assert.deepEqual(selectSubagentTools(parent, ["Write", "dev_frontend_check", "task"]), {});
  const child = selectSubagentTools(parent, ["Read", "Write"]);
  assert.equal(child.Read, parent.Read);
  assert.deepEqual(Object.keys(child), ["Read"]);
});

test("children and parent share the same policy counters", async () => {
  let calls = 0;
  const parent = applyToolCallPolicies({ Read: tool({
    inputSchema: z.object({ value: z.number() }),
    execute: async () => ++calls,
  }) }, { Read: { maxCallsPerTurn: 2, maxIdenticalCallsPerTurn: 1 } });
  const firstChild = selectSubagentTools(parent, ["Read"]);
  const secondChild = selectSubagentTools(parent, undefined);
  assert.equal(await firstChild.Read.execute!({ value: 1 }, options), 1);
  const repeated = await secondChild.Read.execute!({ value: 1 }, options);
  assert.ok(isStructuredToolResult(repeated));
  assert.equal(repeated.ok, false);
  const exhausted = await parent.Read.execute!({ value: 2 }, options);
  assert.ok(isStructuredToolResult(exhausted));
  assert.equal(exhausted.ok, false);
  assert.equal(calls, 1);
});

test("delegation retains approval and model-output policy on inherited definitions", () => {
  const definition = tool({
    inputSchema: z.object({}), needsApproval: true,
    execute: async () => "secret",
    toModelOutput: () => ({ type: "text", value: "redacted" }),
  });
  const child = selectSubagentTools({ guarded: definition }, undefined);
  assert.equal(child.guarded, definition);
  assert.equal(child.guarded.needsApproval, true);
  assert.equal(child.guarded.toModelOutput, definition.toModelOutput);
});

test("nested tasks exclude client-only live and question tools without restoring a disk implementation", async () => {
  const server = tool({ inputSchema: z.object({}), execute: async () => "server" });
  const client = tool({ inputSchema: z.object({ action: z.string() }) });
  const parent = { Read: server, workspace_program: client, ask_question: client, task: server };
  const child = selectSubagentTools(parent, undefined);
  assert.deepEqual(Object.keys(child), ["Read"]);
  assert.equal(child.Read, server);
  assert.equal(await child.Read.execute!({}, options), "server");
  assert.deepEqual(selectSubagentTools(parent, ["workspace_program", "ask_question", "task", "qkrpc_action_get"]), {});
});
