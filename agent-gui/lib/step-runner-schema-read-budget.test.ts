import assert from "node:assert/strict";
import test from "node:test";
import nativeFixtures from "./fixtures/step-runner-schema-read.native.json";
import type { AgentUIMessage } from "./chat-types";
import type { ModelMessage } from "ai";
import { createStepRunnerKnowledgeTools } from "./step-runner-knowledge-tools.server";
import { withModelFacingToolOutput } from "./tool-model-output";
import { formatToolResultForAgent } from "./tool-result-agent-view";
import { buildModelFacingToolOutput, stripToolDisplayDataFromMessages } from "./tool-result-model-messages";
import { microcompactToolOutputs } from "./context-microcompact";
import { microcompactStepModelMessages } from "./context-step-microcompact";
import {
  STEP_RUNNER_SCHEMA_READ_FORMAT as format,
  readStepRunnerSchemaRead,
  startStepRunnerSchemaRead,
  type StepRunnerSchemaRead,
  type StepRunnerSchemaReadInput,
} from "./step-runner-schema-read";

const observation = `sha256:${"a".repeat(64)}`;
const key = "sys:fixture";
const controlField = " \"\\\n选项😀 ";
const rawText = JSON.stringify("\u0000\"\\😀\ud800 end ".repeat(300));

test("actual C# fake-pipe serialization preserves child omission, JSON token pages and metadata through the SDK", async () => {
  // Captured from QuickerRpc.Tests.Cli SchemaRead fake-pipe fixtures, without rewriting wire fields.
  for (const data of nativeFixtures) {
    const original = data.payload.schemaRead;
    const input = original.input as StepRunnerSchemaReadInput;
    const output = await model(input, { ok: true, exitCode: 0, source: "qkrpc", data } as any);
    assert.deepEqual(receipt(output), original);
    assert.deepEqual(output.data.payload.knowledge, data.payload.knowledge);
    assert.equal(output.data.payload.knowledgeStatus, "preserved");
  }
});

function page(input: StepRunnerSchemaReadInput, text = rawText): StepRunnerSchemaRead {
  const pointer = input.read.pointer ?? "", offset = input.read.offset ?? 0;
  const content = text.slice(offset, offset + 600);
  const nextOffset = offset + content.length < text.length ? offset + content.length : null;
  const selectedComplete = offset === 0 && content.length === text.length;
  const args = { ...input, read: { pointer, mode: "value" as const, offset, expectedObservation: observation } };
  return {
    format, status: "available", observation, pointer, mode: "value", offset, offsetUnit: "utf16", total: text.length,
    nextOffset, selectedComplete, agentSchemaComplete: pointer === "" && selectedComplete,
    content, input: args,
    ...(nextOffset !== null ? { nextRead: { ...args, read: { ...args.read, offset: nextOffset } } } : {}),
  };
}

function wire(schemaRead: unknown, extra: Record<string, unknown> = {}) {
  return { ok: true, exitCode: 0, source: "qkrpc" as const,
    data: { action: "step-runner-get", payload: { success: true, schemaRead, knowledgeStatus: "unknown" } }, ...extra };
}

function receipt(output: any): StepRunnerSchemaRead {
  return output.data.payload?.schemaRead ?? output.data.schemaRead;
}

async function model(input: StepRunnerSchemaReadInput, result: ReturnType<typeof wire>) {
  const tool = withModelFacingToolOutput(createStepRunnerKnowledgeTools().qkrpc_step_runner_get);
  const output = formatToolResultForAgent("qkrpc_step_runner_get", input, result);
  const response: any = await tool.toModelOutput!({ toolCallId: "budget", input, output });
  assert.ok(JSON.stringify(response.value).length <= 8192);
  assert.equal(response.value.displayData, undefined);
  assert.deepEqual(output.displayData, result.data, "The original display result must survive validation/projection");
  return response.value;
}

for (const compression of ["0", "1"]) {
  test(`atomic UTF16 pages survive formatter, SDK and history with compression=${compression}`, async () => {
    const before = process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
    process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION = compression;
    try {
      let input: StepRunnerSchemaReadInput | undefined = { key, controlField, read: { pointer: "/description", mode: "value", offset: 0 } };
      let collected = "", count = 0;
      while (input) {
        const rawPage = page(input);
        const output = await model(input, wire(rawPage, { summary: "\u0000".repeat(30000), stderr: "\"\\".repeat(30000) }));
        const received = receipt(output);
        assert.deepEqual(received, rawPage);
        assert.equal(output.data.payload.knowledgeStatus, "unknown");
        collected += received.content;
        const history: AgentUIMessage[] = [{ id: "a", role: "assistant", parts: [{ type: "tool-qkrpc_step_runner_get", toolCallId: "c", state: "output-available", input, output }] }];
        const replayed: any = stripToolDisplayDataFromMessages(history)[0].parts[0];
        assert.deepEqual(receipt(replayed.output), received);
        assert.deepEqual(buildModelFacingToolOutput(output), output, "History projection is idempotent");
        input = received.nextRead;
        assert.ok(++count < 100);
      }
      assert.equal(collected, rawText, "Do not decode or rewrite JSON number/string lexemes while paging");
      assert.ok(count > 2);
    } finally {
      if (before === undefined) delete process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
      else process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION = before;
    }
  });
}

test("children retains over forty direct entries, exact pointer escapes, and a later field behind a huge first value", async () => {
  const children = Array.from({ length: 45 }, (_, i) => ({ pointer: `/field${i === 0 ? "~1~0" : i}`, type: "string" as const, jsonChars: i === 0 ? 100000 : 12 }));
  const input: StepRunnerSchemaReadInput = { key, controlField: "", read: { pointer: "", mode: "children", offset: 0, expectedObservation: observation } };
  const source: StepRunnerSchemaRead = { format, status: "available", observation, pointer: "", mode: "children", offset: 0,
    offsetUnit: "children", total: children.length, nextOffset: null, selectedComplete: true, agentSchemaComplete: false, children, input };
  const result = receipt(await model(input, wire(source)));
  assert.deepEqual(result.children, children);
  const later: StepRunnerSchemaReadInput = { ...result.input!, read: { ...result.input!.read, pointer: result.children![44].pointer, mode: "value", offset: 0 } };
  assert.equal(receipt(await model(later, wire(page(later, '"tail field"')))).content, '"tail field"');
});

test("model-delivered nextRead is accepted unchanged by the real tool schema and execute argv on every page", async () => {
  const calls: StepRunnerSchemaReadInput[] = [];
  const tool = withModelFacingToolOutput(createStepRunnerKnowledgeTools(async (args) => {
    assert.deepEqual(args.slice(0, 4), ["step-runner", "get", "--key", key]);
    assert.ok(args.includes("--control-field-json"));
    const actual: StepRunnerSchemaReadInput = {
      key: args[3], controlField: JSON.parse(args[args.indexOf("--control-field-json") + 1]),
      read: JSON.parse(args[args.indexOf("--schema-read") + 1]),
    };
    calls.push(actual);
    return wire(page(actual));
  }).qkrpc_step_runner_get);
  let input: StepRunnerSchemaReadInput | undefined = { key, controlField, read: { pointer: "/text", mode: "value", offset: 0 } };
  let receivedText = "";
  while (input) {
    const current = input;
    const accepted = (tool.inputSchema as any).parse(current);
    assert.deepEqual(accepted, current);
    const output = await tool.execute!(accepted, { toolCallId: `page-${calls.length}`, messages: [] });
    const model: any = await tool.toModelOutput!({ toolCallId: "next-read", input: accepted, output });
    assert.deepEqual(calls.at(-1), current, "No control, pointer, stamp or cursor may be changed in transport argv");
    assert.ok(JSON.stringify(model.value).length <= 8192);
    receivedText += receipt(model.value).content;
    input = receipt(model.value).nextRead;
    assert.ok(calls.length < 100);
  }
  assert.equal(receivedText, rawText);
  assert.ok(calls.length > 2);
});

test("large legacy/object defaults give exact root start without claiming paging support", () => {
  for (const compression of ["0", "1"]) {
    const before = process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
    process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION = compression;
    try {
      for (const legacy of [true, false]) {
        const schema = { inputs: [{ key: "large", description: "x".repeat(30000) }] };
        const raw = { ok: true, exitCode: 0, source: "qkrpc", data: { action: "step-runner-get", payload: legacy ? { schemaJson: JSON.stringify(schema) } : { schema } } };
        const input = { key, controlField: "" };
        const shaped = formatToolResultForAgent("qkrpc_step_runner_get", input, raw);
        const output = buildModelFacingToolOutput(shaped) as any;
        const read = receipt(output);
        assert.equal(read.status, "start");
        assert.equal(read.observation, undefined);
        assert.equal(read.selectedComplete, false);
        assert.deepEqual(read.input, { ...input, read: { pointer: "", mode: "children", offset: 0 } });
        assert.deepEqual(shaped.displayData, raw.data);
        assert.ok(JSON.stringify(output).length <= 8192);
      }
    } finally {
      if (before === undefined) delete process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
      else process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION = before;
    }
  }
});

test("unsupported, excessive and failed receipts never leak a partial body or a fabricated cursor", async () => {
  const input: StepRunnerSchemaReadInput = { key, controlField, read: { pointer: "/text", mode: "value", offset: 0 } };
  const valid = page(input);
  const bads = [
    { ...valid, format: "future.v2" },
    { ...valid, input: { ...valid.input, key: "x".repeat(3000) } },
    { ...valid, content: "\u0000".repeat(3000) },
    { ...valid, nextOffset: 1 },
    { ...valid, nextRead: { ...valid.nextRead, key: "different-owner" } },
    { ...valid, selectedComplete: true },
    { ...valid, observation: undefined, input: { ...valid.input, read: { ...valid.input!.read, expectedObservation: undefined } }, nextRead: { ...valid.nextRead, read: { ...valid.nextRead!.read, expectedObservation: undefined } } },
  ];
  for (const bad of bads) {
    const output = await model(input, wire(bad));
    assert.equal(receipt(output).status, "unavailable");
    assert.equal(receipt(output).content, undefined);
    assert.equal(receipt(output).nextRead, undefined);
    assert.equal(receipt(output).selectedComplete, false);
    assert.equal(receipt(output).agentSchemaComplete, false);
  }
  const failed = await model(input, wire(valid, { ok: false, exitCode: 1, userDecisionRequired: true, retryable: false }));
  assert.equal(failed.ok, false);
  assert.equal(failed.userDecisionRequired, true);
  assert.equal(failed.retryable, false);
  assert.equal(receipt(failed).error?.code, "schema_read_failed");
  const tooLargePayload = wire(valid);
  (tooLargePayload.data.payload as any).knowledge = { enormous: "\u0000".repeat(3000) };
  assert.equal(receipt(await model(input, tooLargePayload)).error?.code, "schema_read_page_too_large");
  const unrelated = buildModelFacingToolOutput({ data: { schemaRead: valid }, huge: "x".repeat(30000) });
  assert.ok(JSON.stringify(unrelated).length <= 8192, "A non-tool object must still receive the generic budget");
});

test("unavailable stale results keep a bounded exact replay input and unknown provenance", async () => {
  const input: StepRunnerSchemaReadInput = { key, controlField, read: { pointer: "/text", mode: "value", offset: 600, expectedObservation: observation } };
  const stale: StepRunnerSchemaRead = { ...page(input), status: "unavailable", content: undefined, nextRead: undefined, nextOffset: null,
    selectedComplete: false, agentSchemaComplete: false, total: null, error: { code: "SCHEMA_READ_STALE", message: "Observation changed; restart with a fresh root read." } };
  const raw = wire(stale, { ok: false, exitCode: 1 });
  raw.data.payload.success = false;
  const output = await model(input, raw);
  assert.deepEqual(receipt(output).input, input);
  assert.equal(receipt(output).error?.code, "SCHEMA_READ_STALE");
  assert.equal(output.data.payload.knowledgeStatus, "unknown");
});

test("unknown owner permits only a complete first page without manufacturing an observation", async () => {
  const input: StepRunnerSchemaReadInput = { key, read: { pointer: "", mode: "value", offset: 0 } };
  const one = { ...page(input, '{"small":true}'), observation: undefined, input };
  const output = await model(input, wire(one));
  assert.equal(receipt(output).status, "available");
  assert.equal(receipt(output).observation, undefined);
  assert.equal(output.data.payload.knowledgeStatus, "unknown");
  const lastInput = { ...input, read: { ...input.read, offset: 5 } };
  const last = { ...page(lastInput, "123456"), observation: undefined, input: lastInput };
  assert.equal(receipt(await model(lastInput, wire(last))).status, "unavailable");
});

test("complete root JSON preserves numeric lexemes and loses completeness when history omits its body", async () => {
  const input: StepRunnerSchemaReadInput = { key, read: { pointer: "", mode: "value", offset: 0 } };
  const text = '{"integer":9007199254740993,"decimal":1.234567890123456789,"empty":""}';
  const output = await model(input, wire(page(input, text)));
  assert.equal(receipt(output).content, text);
  assert.equal(receipt(output).selectedComplete, true);
  assert.equal(receipt(output).agentSchemaComplete, true);
  const messages: ModelMessage[] = [{ role: "tool", content: [{ type: "tool-result", toolName: "qkrpc_step_runner_get", toolCallId: "c", output: { type: "json", value: output } }] }];
  const compact: any = microcompactStepModelMessages(messages, { protectRecentToolResults: 0, minOutputTokens: 0 }).messages[0].content[0];
  const read = receipt(compact.output.value);
  assert.equal(read.content, undefined);
  assert.equal(read.selectedComplete, false);
  assert.equal(read.agentSchemaComplete, false);
  assert.deepEqual(read.input, receipt(output).input);
});

test("both historical compaction entrypoints remove page body and retain same-page replay, never the skipped-page cursor", () => {
  const input: StepRunnerSchemaReadInput = { key, controlField, read: { pointer: "/text", mode: "value", offset: 0 } };
  const source = wire(page(input)); // No summary/truncated flag: actual fall-through paths must recognize the receipt.
  const messages: AgentUIMessage[] = [
    { id: "u", role: "user", parts: [{ type: "text", text: "read" }] },
    { id: "a", role: "assistant", parts: [{ type: "tool-qkrpc_step_runner_get", toolCallId: "c", state: "output-available", input, output: source }] },
    { id: "next", role: "user", parts: [{ type: "text", text: "next" }] },
  ];
  const ui: any = microcompactToolOutputs(messages, { splitIndex: 2, protectRecentRounds: 0, minOutputTokens: 0 }).messages[1].parts[0];
  const step: ModelMessage[] = [{ role: "tool", content: [{ type: "tool-result", toolName: "qkrpc_step_runner_get", toolCallId: "c", output: { type: "json", value: source } }] }];
  const sdk: any = microcompactStepModelMessages(step, { protectRecentToolResults: 0, minOutputTokens: 0 }).messages[0].content[0];
  for (const output of [ui.output, sdk.output.value]) {
    const read = receipt(buildModelFacingToolOutput(output));
    assert.equal(read.status, "unavailable");
    assert.equal(read.error?.code, "schema_read_body_compacted");
    assert.equal(read.content, undefined);
    assert.equal(read.nextRead, undefined);
    assert.equal(read.selectedComplete, false);
    assert.equal(read.agentSchemaComplete, false);
    assert.deepEqual(read.input, page(input).input);
    assert.equal(read.observation, observation);
    assert.ok(JSON.stringify(output).length <= 8192);
  }
});

test("receipt validation rejects foreign/duplicate child paths and forged starts without shortening identities", () => {
  const input: StepRunnerSchemaReadInput = { key, read: { pointer: "/parent", mode: "children", offset: 0, expectedObservation: observation } };
  for (const pointers of [["/elsewhere"], ["/parent/nested/child"], ["/parent/x", "/parent/x"]]) {
    const read = { format, status: "available", observation, pointer: "/parent", mode: "children", offset: 0, offsetUnit: "children",
      total: pointers.length, nextOffset: null, selectedComplete: true, agentSchemaComplete: false, input,
      children: pointers.map(pointer => ({ pointer, type: "string", jsonChars: 10 })) };
    assert.equal(readStepRunnerSchemaRead(read).status, "unavailable");
  }
  const start = startStepRunnerSchemaRead({ key, controlField: "" });
  assert.equal(readStepRunnerSchemaRead({ ...start, input }).status, "unavailable");
  assert.equal(startStepRunnerSchemaRead({ key: "x".repeat(3000) }).status, "unavailable");
});
