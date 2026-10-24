import assert from "node:assert/strict";
import { test } from "node:test";
import { GREP_TOOL } from "@/lib/host-tool-constants";
import { formatLocalToolResult, isStructuredToolResult } from "@/lib/tool-result";
import {
  applyAlwaysOnToolResultShape,
  slimStepRunnerSearchItem,
} from "@/lib/tool-result-always-shape";
import {
  formatToolResultForAgent,
  isToolResultAgentViewCompressionEnabled,
} from "@/lib/tool-result-agent-view";

test("slimStepRunnerSearchItem truncates long description", () => {
  const long = "x".repeat(200);
  const slim = slimStepRunnerSearchItem({
    key: "sys:http",
    name: "HTTP",
    description: long,
  });
  assert.ok(slim.description!.length < long.length);
  assert.ok(slim.description!.endsWith("…"));
});

test("applyAlwaysOnToolResultShape groups duplicate grep paths when compression off", () => {
  const prev = process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
  process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION = "0";
  try {
    const raw = formatLocalToolResult({
      action: "grep",
      success: true,
      outputMode: "content",
      pattern: "foo",
      searchPath: ".",
      matches: [
        { path: "a.ts", line: 1, content: "one" },
        { path: "a.ts", line: 2, content: "two" },
      ],
    });
    const shaped = applyAlwaysOnToolResultShape(
      GREP_TOOL,
      { pattern: "foo" },
      raw,
    );
    assert.ok(isStructuredToolResult(shaped));
    const matches = (shaped.data as { matches: unknown[] }).matches;
    assert.equal(matches.length, 1);
    assert.equal((matches[0] as { path: string }).path, "a.ts");
    assert.equal(((matches[0] as { hits: unknown[] }).hits).length, 2);
  } finally {
    if (prev === undefined) delete process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
    else process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION = prev;
  }
});

test("isToolResultAgentViewCompressionEnabled defaults to on", () => {
  const prev = process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
  delete process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
  assert.equal(isToolResultAgentViewCompressionEnabled(), true);
  process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION = "0";
  assert.equal(isToolResultAgentViewCompressionEnabled(), false);
  if (prev === undefined) delete process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
  else process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION = prev;
});

test("formatToolResultForAgent compresses large step_runner_get schema by default", () => {
  const prev = process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
  delete process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
  try {
    const schemaJson = JSON.stringify({
      StepRunnerKey: "sys:assign",
      inputParams: [{ key: "varKey", valueType: "text" }],
      note: "z".repeat(8_000),
    });
    const raw = formatLocalToolResult({
      ok: true,
      payload: { success: true, schemaJson },
    }, true);
    raw.source = "qkrpc";
    const result = formatToolResultForAgent(
      "qkrpc_step_runner_get",
      { key: "sys:assign" },
      raw,
    );
    assert.ok(isStructuredToolResult(result));
    assert.ok(result.displayData != null);
    const data = result.data as Record<string, unknown>;
    const payload = (data.payload ?? data) as Record<string, unknown>;
    assert.equal(payload.schemaJson, undefined);
    assert.equal(payload.schemaJsonOmitted, true);
  } finally {
    if (prev === undefined) delete process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
    else process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION = prev;
  }
});

test("large schema shaping preserves the observed knowledge owner and exact control intent", () => {
  const knowledge = {
    schemaVersion: 1,
    source: { provider: "qkrpc.step-runner", kind: "runtime-definition", hostSessionId: "current-owner" },
    schema: { format: "qkrpc.agent-step-runner.v1", revision: "sha256:" + "a".repeat(64) },
    requestedControlFieldValue: " MixedCase ",
    nativeHelpLink: "https://example.test/current-module",
    bundledReference: { source: "bundled-fallback", bundleVersion: "fixture", indexRevision: "unknown" },
  };
  for (const property of ["schemaJson", "SchemaJson"]) {
    const schemaJson = JSON.stringify({
      stepRunnerKey: "fixture:current", inputs: [{ key: "currentInput", valueType: "Text" }],
      knowledge, note: "z".repeat(8_000),
    });
    const result = formatToolResultForAgent("qkrpc_step_runner_get", { key: "fixture:current" },
      formatLocalToolResult({ payload: { success: true, [property]: schemaJson } }));
    assert.ok(isStructuredToolResult(result));
    const payload = (result.data as { payload: Record<string, unknown> }).payload;
    assert.equal(payload.schemaJsonOmitted, true);
    assert.deepEqual(payload.knowledge, knowledge);
    assert.deepEqual(payload.inputParamKeys, ["currentInput"]);
    assert.equal(payload[property], undefined);
    assert.match(String(payload.readHint), /not an editing contract/i);
    assert.equal(((result.displayData as { payload: Record<string, unknown> }).payload)[property], schemaJson);
  }
});

test("large legacy schemas without provenance do not gain fabricated knowledge metadata", () => {
  const result = formatToolResultForAgent("qkrpc_step_runner_get", { key: "fixture:old" },
    formatLocalToolResult({ payload: { success: true, schemaJson: JSON.stringify({
      StepRunnerKey: "fixture:old", inputParams: [{ key: "legacyInput" }], note: "z".repeat(8_000),
    }) } }));
  assert.ok(isStructuredToolResult(result));
  const payload = (result.data as { payload: Record<string, unknown> }).payload;
  assert.equal(payload.schemaJsonOmitted, true);
  assert.deepEqual(payload.inputParamKeys, ["legacyInput"]);
  assert.equal(Object.hasOwn(payload, "knowledge"), false);
});
