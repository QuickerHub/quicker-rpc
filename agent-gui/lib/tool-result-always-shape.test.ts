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
