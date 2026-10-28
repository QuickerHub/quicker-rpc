import assert from "node:assert/strict";
import { test } from "node:test";
import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";
import { applyToolModeGuards, describeToolModeOperations } from "./agent-tool-mode-guard";
import { programToolExecutionPort, programToolOperationFacts } from "./program-tool-operation-facts";
import { formatCurrentToolCatalogSystem } from "./tool-catalog-system-prompt";
import { executeListToolsTool } from "./list-tools-tool-execute";
import { resolveTurnPlan } from "./agent-core/turn-plan";
import { formatLocalToolResult, isStructuredToolResult } from "./tool-result";
import type { AgentUIMessage } from "./chat-types";
import { buildAgentRuntimeSnapshot } from "./agent-runtime-snapshot";

const scope = { pinnedLatest: undefined, pinnedLatestAll: [] };
const options = { toolCallId: "program-facts", messages: [] } as ToolExecutionOptions;
const rows = [
  { id: "qkrpc_action_get", mode: "agent", input: {}, read: false, allowed: true, host: "none", local: "possible", bootstrap: "possible" },
  { id: "qkrpc_subprogram_get", mode: "agent", input: {}, read: false, allowed: true, host: "none", local: "possible", bootstrap: "possible" },
  { id: "qkrpc_action_get", mode: "launcher", input: {}, read: false, allowed: true, host: "none", local: "possible", bootstrap: "possible" },
  { id: "qkrpc_subprogram_get", mode: "launcher", input: {}, read: false, allowed: true, host: "none", local: "possible", bootstrap: "possible" },
  { id: "qkrpc_action_get", mode: "ask", input: { action: "export", readOnly: false }, read: true, allowed: true, host: "none", local: "none", bootstrap: "none" },
  { id: "qkrpc_subprogram_get", mode: "ask", input: {}, read: false, allowed: false, host: "unknown", local: "unknown", bootstrap: "unknown" },
  { id: "workspace_program", mode: "agent", input: { action: "read_data" }, read: false, allowed: true, host: "none", local: "possible", bootstrap: "possible" },
  { id: "workspace_program", mode: "ask", input: { action: "read_data", readOnly: false }, read: true, allowed: true, host: "none", local: "none", bootstrap: "none" },
  { id: "workspace_program", mode: "agent", input: { action: "patch" }, read: false, allowed: true, host: "possible", local: "possible", bootstrap: "possible" },
  { id: "workspace_program", mode: "launcher", input: { action: "read_data" }, read: false, allowed: true, host: "none", local: "possible", bootstrap: "possible" },
  { id: "workspace_program", mode: "ask", input: { action: "patch" }, read: true, allowed: false, host: "unknown", local: "unknown", bootstrap: "unknown" },
  { id: "qkrpc_action_open", mode: "agent", input: {}, read: false, allowed: true, host: "none", local: "possible", bootstrap: "possible" },
  { id: "qkrpc_action_open", mode: "launcher", input: {}, read: false, allowed: true, host: "none", local: "possible", bootstrap: "possible" },
  { id: "qkrpc_action_open", mode: "ask", input: {}, read: false, allowed: false, host: "none", local: "possible", bootstrap: "possible" },
] as const;

test("wrapper facts project the same ports into recovery, catalog, system and final execution without granting permission", async () => {
  for (const row of rows) {
    let base = 0, reads = 0, approvals = 0;
    const needsApproval = () => { approvals++; return true; };
    const definition = tool({ inputSchema: z.object({}).passthrough(), needsApproval,
      execute: async () => { base++; return formatLocalToolResult({ port: "base" }); } });
    const ports = row.read ? { [row.id]: async () => { reads++; return formatLocalToolResult({ port: "read" }); } } : {};
    const tools = applyToolModeGuards({ [row.id]: definition }, row.mode, ports);
    assert.equal(tools[row.id].needsApproval, needsApproval, "the final definition retains its real approval callback");
    const port = programToolExecutionPort(row.id, row.mode, row.read)!;
    const facts = programToolOperationFacts(row.id, row.input, port);
    assert.equal(facts.hostMutation, row.host); assert.equal(facts.localPersistence, row.local); assert.equal(facts.connectionBootstrap, row.bootstrap);
    const next = { tool: row.id, input: row.input, reason: "Required fixture step", priority: "required" as const };
    const messages = [{ id: "prior", role: "assistant", parts: [{ type: "tool-fixture", toolCallId: "prior", state: "output-available", input: {},
      output: formatLocalToolResult({}, false, "Required step", { nextActions: [next] }) }] }] as AgentUIMessage[];
    const plan = resolveTurnPlan({ actionScope: scope, chatMode: row.mode, enabledToolIds: [row.id],
      readOnlyExecutorToolIds: Object.keys(ports), messages, userText: "继续读取" });
    assert.deepEqual(plan.proposedOperation, facts);
    assert.equal(Boolean(plan.nextAction), row.allowed);
    if (!row.allowed) { assert.equal(plan.recoveryDecision.kind, "ask_user"); assert.ok(plan.blockedNextAction); }
    if (row.allowed && row.local === "possible") assert.equal(plan.risk, "write", "implicit export/bootstrap cannot keep a read-only recovery classification");
    const snapshot = buildAgentRuntimeSnapshot({ actionScope: scope, chatMode: row.mode, enabledToolIds: [row.id], messages, userText: "different", turnPlan: plan });
    assert.equal(snapshot.turnPlan, plan);
    const policy = { mode: row.mode, readOnlyExecutorToolIds: Object.keys(ports) };
    const text = formatCurrentToolCatalogSystem(tools, policy);
    const catalog = JSON.parse(text.split("<current-tool-catalog>\n")[1].split("\n</current-tool-catalog>")[0]);
    const observed = catalog.tools[0];
    assert.equal(observed.approval, "runtime");
    assert.deepEqual(observed.operationPolicy, JSON.parse(JSON.stringify(describeToolModeOperations(row.id, row.mode, row.read))));
    const discovery = await executeListToolsTool({ action: "get", toolId: row.id }, { ...policy, tools });
    assert.ok(isStructuredToolResult(discovery));
    if (discovery.ok) {
      assert.equal((discovery.data as { approval: string }).approval, "runtime");
      assert.deepEqual((discovery.data as { operationPolicy: unknown }).operationPolicy, observed.operationPolicy);
    }
    assert.equal(approvals, 0, "observation cannot execute an approval decision");
    const result = await tools[row.id].execute!(row.input, options);
    assert.ok(isStructuredToolResult(result)); assert.equal(result.ok, row.allowed);
    assert.equal(base, row.allowed && row.mode !== "ask" ? 1 : 0);
    assert.equal(reads, row.allowed && row.mode === "ask" ? 1 : 0);
  }
});

test("input-specific exceptions and unmodelled ports retain honest effects", () => {
  const facts = (input: unknown) => programToolOperationFacts("workspace_program", input, "workspace");
  assert.equal(facts({ action: "projects_list", target: "action" }).localPersistence, "none");
  assert.equal(facts({ action: "projects_list", target: "all" }).implicitRepair, "possible");
  assert.equal(facts({ action: "read_data", mode: "summary" }).localPersistence, "none");
  assert.equal(facts({ action: "read_data", mode: "content" }).implicitExport, "possible");
  assert.equal(facts({ action: "file_write" }).hostMutation, "none");
  assert.equal(facts({ action: "file_write" }).connectionBootstrap, "possible", "background lint belongs to the wrapper");
  for (const fact of [facts({ action: "future_action" }), programToolOperationFacts("workspace_program", { action: "read_live" }, "renderer-live"),
    programToolOperationFacts("mcp__unknown", {}, "connected-host")]) {
    assert.equal(fact.known, false); assert.equal(fact.hostMutation, "unknown"); assert.equal(fact.replayAfterUnknown, "unknown");
  }
  assert.equal(programToolExecutionPort("mcp__unknown", "ask", true), undefined);
});
