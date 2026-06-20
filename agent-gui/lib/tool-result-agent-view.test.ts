import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatToolResultForAgent,
  estimateStructuredResultChars,
  AGENT_PAYLOAD_SOFT_CHARS,
} from "@/lib/tool-result-agent-view";
import {
  QKRPC_ACTION_DEBUG_TOOL,
  QKRPC_ACTION_GET_TOOL,
  QKRPC_ACTION_QUERY_TOOL,
} from "@/lib/qkrpc-action-tool";
import {
  QKRPC_SUBPROGRAM_GET_TOOL,
  QKRPC_SUBPROGRAM_QUERY_TOOL,
} from "@/lib/qkrpc-subprogram-tool";
import { GREP_TOOL, SHELL_TOOL, WRITE_TOOL } from "@/lib/host-tool-constants";
import { DOCS_TOOL } from "@/lib/docs-tool";
import { BROWSER_TOOL } from "@/lib/browser-tool-constants";
import { WEB_SEARCH_TOOL } from "@/lib/web-search-tool-constants";
import { WORKSPACE_PROGRAM_TOOL } from "@/lib/workspace-program-tool";
import {
  formatLocalToolResult,
  isStructuredToolResult,
  type StructuredToolResult,
} from "@/lib/tool-result";
import { stripToolDisplayDataFromMessages } from "@/lib/tool-result-model-messages";
import type { AgentUIMessage } from "@/lib/chat-types";
import { microcompactToolOutputs } from "@/lib/context-microcompact";

describe("formatToolResultForAgent", () => {
  process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION = "1";

  it("compresses large shell output and keeps displayData", () => {
    const raw = formatLocalToolResult({
      commandLine: "echo test",
      output: "x".repeat(AGENT_PAYLOAD_SOFT_CHARS + 500),
    });
    const result = formatToolResultForAgent(
      SHELL_TOOL,
      { description: "test", command: "echo test" },
      raw,
    );
    assert.ok(isStructuredToolResult(result));
    assert.ok(result.displayData);
    assert.ok(result.summary?.includes("shell"));
    const data = result.data as Record<string, unknown>;
    assert.ok(typeof data.output === "string");
    assert.ok((data.output as string).length < AGENT_PAYLOAD_SOFT_CHARS);
    assert.ok(
      estimateStructuredResultChars(result as StructuredToolResult)
      < JSON.stringify(raw).length,
    );
  });

  it("compresses debug trace events into summary and trace window", () => {
    const events = [
      { kind: "step_begin", stepRunnerName: "assign", depth: 0 },
      { kind: "input", paramKey: "x", paramValue: "1", depth: 1 },
      { kind: "error", message: "boom", depth: 1 },
    ];
    const raw = formatLocalToolResult({
      ok: false,
      eventCount: events.length,
      events,
      failureLocation: {
        dataJsonPointer: "/steps/0",
        locationSummary: "step 0 assign",
      },
    }, false);

    const result = formatToolResultForAgent(
      QKRPC_ACTION_DEBUG_TOOL,
      { id: "00000000-0000-0000-0000-000000000001" },
      raw,
    );
    assert.ok(isStructuredToolResult(result));
    const data = result.data as Record<string, unknown>;
    assert.equal(data.eventCount, 3);
    assert.ok(Array.isArray((data.traceWindow as { lines: string[] }).lines));
    assert.equal((data as { events?: unknown }).events, undefined);
    assert.ok(result.displayData);
    const display = result.displayData as Record<string, unknown>;
    assert.equal((display as { events?: unknown }).events, undefined);
    assert.match(result.summary ?? "", /\/steps\/0/);
    assert.ok(result.nextActions?.length);
  });

  it("compresses successful debug with traceRef without events in model payload", () => {
    const events = [
      { kind: "step_begin", stepRunnerName: "assign", elapsedMs: 50, stepPath: "0" },
      { kind: "step_begin", note: "截图", elapsedMs: 4317, stepPath: "1" },
    ];
    const traceRef = {
      path: ".local/action-trace/test/trace.json",
      format: "action-trace-v1",
    };
    const raw = formatLocalToolResult({
      ok: true,
      eventCount: events.length,
      durationMs: 5777,
      events,
      traceRef,
      stepSummaries: [
        { name: "assign", elapsedMs: 50, stepPath: "0" },
        { name: "截图", elapsedMs: 4317, stepPath: "1" },
      ],
    });

    const result = formatToolResultForAgent(
      QKRPC_ACTION_DEBUG_TOOL,
      { id: "00000000-0000-0000-0000-000000000002" },
      raw,
    );
    assert.ok(isStructuredToolResult(result));
    const data = result.data as Record<string, unknown>;
    assert.equal(data.outcome, "success");
    assert.equal((data as { events?: unknown }).events, undefined);
    assert.deepEqual(data.traceRef, traceRef);
    assert.ok(Array.isArray(data.stepSummaries));
    assert.equal((data.stepSummaries as unknown[]).length, 2);
    const display = result.displayData as Record<string, unknown>;
    assert.equal((display as { events?: unknown }).events, undefined);
    assert.deepEqual(display.traceRef, traceRef);
    assert.match(result.summary ?? "", /trace\.json/);
  });

  it("skips full_trace refetch when traceRef is present on failure", () => {
    const events = [
      { kind: "step_begin", stepRunnerName: "assign", depth: 0 },
      { kind: "error", message: "boom", depth: 1 },
    ];
    const traceRef = {
      path: ".local/action-trace/test/fail.json",
      format: "action-trace-v1",
    };
    const raw = formatLocalToolResult({
      ok: false,
      eventCount: events.length,
      events,
      traceRef,
      failureLocation: { dataJsonPointer: "/steps/0" },
    }, false);

    const result = formatToolResultForAgent(
      QKRPC_ACTION_DEBUG_TOOL,
      { id: "00000000-0000-0000-0000-000000000003" },
      raw,
    );
    assert.ok(isStructuredToolResult(result));
    assert.equal(result.nextActions?.length ?? 0, 0);
    assert.match(result.summary ?? "", /fail\.json/);
  });

  it("compresses large workspace_program read_data content", () => {
    const raw = formatLocalToolResult({
      action: "program-data-read",
      success: true,
      path: "data.json",
      content: "x".repeat(AGENT_PAYLOAD_SOFT_CHARS + 500),
      totalChars: AGENT_PAYLOAD_SOFT_CHARS + 500,
    });
    const result = formatToolResultForAgent(
      WORKSPACE_PROGRAM_TOOL,
      {
        action: "read_data",
        target: "action",
        id: "00000000-0000-0000-0000-000000000002",
      },
      raw,
    );
    assert.ok(isStructuredToolResult(result));
    const data = result.data as Record<string, unknown>;
    assert.ok((data.content as string).includes("omitted"));
    assert.ok(result.nextActions?.some((a) => a.tool === WORKSPACE_PROGRAM_TOOL));
  });

  it("compresses grep matches with long line content", () => {
    const matches = Array.from({ length: 30 }, (_, i) => ({
      path: `file-${Math.floor(i / 3)}.ts`,
      line: i + 1,
      content: "match ".repeat(200),
    }));
    const raw = formatLocalToolResult({
      action: "grep",
      success: true,
      pattern: "foo",
      searchPath: ".",
      outputMode: "content",
      matches,
      truncated: true,
      totalMatches: 100,
    });
    const result = formatToolResultForAgent(
      GREP_TOOL,
      { pattern: "foo", head_limit: 30 },
      raw,
    );
    assert.ok(isStructuredToolResult(result));
    assert.ok(result.displayData);
    const agentMatches = (result.data as { matches: Array<{ path: string; hits: unknown[] }> }).matches;
    assert.equal(agentMatches.length, 10);
    assert.equal(agentMatches[0].hits.length, 3);
    assert.ok(
      estimateStructuredResultChars(result as StructuredToolResult)
      < estimateStructuredResultChars(raw),
    );
  });

  it("compresses docs get markdown preview", () => {
    const raw = formatLocalToolResult({
      action: "docs-get",
      docsAction: "get",
      success: true,
      mode: "full",
      topic: "authoring-workflow",
      title: "Workflow",
      markdown: `# Title\n${"body ".repeat(3000)}`,
    });
    const result = formatToolResultForAgent(
      DOCS_TOOL,
      { action: "get", topic: "authoring-workflow" },
      raw,
    );
    assert.ok(isStructuredToolResult(result));
    const data = result.data as Record<string, unknown>;
    assert.ok((data.markdown as string).length < AGENT_PAYLOAD_SOFT_CHARS);
    assert.ok(result.displayData);
  });

  it("compresses action query item list", () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      actionId: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      title: `Action ${i}`,
      description: "d".repeat(200),
      profileName: "Default",
    }));
    const raw = formatLocalToolResult(
      { ok: true, payload: { items, matchCount: 60 } },
      true,
    );
    raw.source = "qkrpc";
    const result = formatToolResultForAgent(
      QKRPC_ACTION_QUERY_TOOL,
      { limit: 60 },
      raw,
    );
    assert.ok(isStructuredToolResult(result));
    const payload = (result.data as Record<string, unknown>).payload as Record<string, unknown>;
    assert.ok(Array.isArray(payload.items));
    assert.ok((payload.items as unknown[]).length <= 40);
  });

  it("compresses action get steps into summaries", () => {
    const steps = Array.from({ length: 80 }, (_, i) => ({
      stepRunnerKey: "sys:assign",
      note: `step ${i}`,
      stepId: `s-${i}`,
      inputParams: { x: "y".repeat(500) },
    }));
    const raw = formatLocalToolResult(
      {
        ok: true,
        payload: {
          actionId: "00000000-0000-0000-0000-000000000099",
          title: "Test",
          steps,
        },
      },
      true,
    );
    raw.source = "qkrpc";
    const result = formatToolResultForAgent(
      QKRPC_ACTION_GET_TOOL,
      { action: "get", id: "00000000-0000-0000-0000-000000000099" },
      raw,
    );
    assert.ok(isStructuredToolResult(result));
    const payload = (result.data as Record<string, unknown>).payload as Record<string, unknown>;
    assert.equal(payload.stepCount, 80);
    assert.ok(Array.isArray(payload.stepSummaries));
    assert.equal((payload.stepSummaries as unknown[]).length, 48);
    assert.equal((payload.steps as unknown[] | undefined), undefined);
  });

  it("compresses subprogram get and query payloads", () => {
    const getRaw = formatLocalToolResult({
      ok: true,
      payload: {
        subProgramId: "demo",
        steps: Array.from({ length: 55 }, (_, i) => ({
          stepRunnerKey: "sys:comment",
          stepId: `s-${i}`,
          inputParams: { x: "y".repeat(300) },
        })),
      },
    }, true);
    getRaw.source = "qkrpc";
    const getResult = formatToolResultForAgent(
      QKRPC_SUBPROGRAM_GET_TOOL,
      { action: "get", id: "demo" },
      getRaw,
    );
    const getPayload = (getResult.data as Record<string, unknown>).payload as Record<string, unknown>;
    assert.ok(Array.isArray(getPayload.stepSummaries));

    const queryRaw = formatLocalToolResult({
      ok: true,
      payload: {
        items: Array.from({ length: 50 }, (_, i) => ({
          subProgramId: `sp-${i}`,
          name: `Sub ${i}`,
          description: "z".repeat(160),
        })),
      },
    }, true);
    queryRaw.source = "qkrpc";
    const queryResult = formatToolResultForAgent(
      QKRPC_SUBPROGRAM_QUERY_TOOL,
      { query: "demo" },
      queryRaw,
    );
    const queryPayload = (queryResult.data as Record<string, unknown>).payload as Record<string, unknown>;
    assert.ok((queryPayload.items as unknown[]).length <= 40);
  });

  it("compresses web_search and browser snapshot payloads", () => {
    const searchRaw = formatLocalToolResult({
      action: "web-search",
      success: true,
      query: "test",
      provider: "duckduckgo",
      results: Array.from({ length: 8 }, (_, i) => ({
        title: `R${i}`,
        url: `https://example.com/${i}`,
        snippet: "s ".repeat(150),
      })),
    });
    const searchResult = formatToolResultForAgent(
      WEB_SEARCH_TOOL,
      { query: "test", limit: 8 },
      searchRaw,
    );
    assert.ok(isStructuredToolResult(searchResult));
    assert.ok((searchResult.data as { results: unknown[] }).results.length <= 5);

    const browserRaw = formatLocalToolResult({
      action: "snapshot",
      snapshot: "- btn\n".repeat(2000),
      nodeCount: 99,
    });
    const browserResult = formatToolResultForAgent(
      BROWSER_TOOL,
      { action: "snapshot" },
      browserRaw,
    );
    assert.ok(isStructuredToolResult(browserResult));
    assert.ok(
      ((browserResult.data as Record<string, unknown>).snapshot as string).length
      < AGENT_PAYLOAD_SOFT_CHARS,
    );
  });

  it("omits write tool content echo from agent view", () => {
    const content = "z".repeat(AGENT_PAYLOAD_SOFT_CHARS + 300);
    const raw = formatLocalToolResult({
      action: "file-write",
      success: true,
      path: ".local/out.txt",
      bytesWritten: content.length,
      content,
      previousContent: "old ".repeat(200),
    });
    const result = formatToolResultForAgent(
      WRITE_TOOL,
      { path: ".local/out.txt", content },
      raw,
    );
    assert.ok(isStructuredToolResult(result));
    assert.ok(result.displayData != null);
    assert.ok(!("content" in (result.data as Record<string, unknown>)));
    assert.ok(estimateStructuredResultChars(result) < estimateStructuredResultChars(raw as StructuredToolResult));
    assert.match(String(result.summary), /omitted from agent view/);
  });

  it("omits small write content from agent view", () => {
    const content = "hello world";
    const raw = formatLocalToolResult({
      action: "file-write",
      success: true,
      path: ".local/out.txt",
      bytesWritten: content.length,
      content,
    });
    const result = formatToolResultForAgent(
      WRITE_TOOL,
      { path: ".local/out.txt", content },
      raw,
    );
    assert.ok(isStructuredToolResult(result));
    assert.ok(!("content" in (result.data as Record<string, unknown>)));
    assert.equal((result.data as { bytesWritten: number }).bytesWritten, content.length);
  });

  it("compresses oversized generic qkrpc payloads", () => {
    const raw = formatLocalToolResult({
      ok: true,
      payload: {
        note: "x".repeat(AGENT_PAYLOAD_SOFT_CHARS + 200),
      },
    }, true);
    raw.source = "qkrpc";
    const result = formatToolResultForAgent(
      "qkrpc_fa",
      { query: "star" },
      raw,
    );
    assert.ok(isStructuredToolResult(result));
    assert.ok(result.displayData != null);
    assert.ok(estimateStructuredResultChars(result) < estimateStructuredResultChars(raw as StructuredToolResult));
  });
});

describe("formatToolResultForAgent when compression disabled", () => {
  it("still applies always-on grep grouping", () => {
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
      const result = formatToolResultForAgent(GREP_TOOL, { pattern: "foo" }, raw);
      const matches = (result.data as { matches: unknown[] }).matches;
      assert.equal(matches.length, 1);
    } finally {
      if (prev === undefined) {
        delete process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
      } else {
        process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION = prev;
      }
    }
  });

  it("passes through shell results without semantic compression", () => {
    const prev = process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
    process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION = "0";
    try {
      const raw = formatLocalToolResult({
        commandLine: "echo test",
        output: "x".repeat(AGENT_PAYLOAD_SOFT_CHARS + 500),
      });
      const result = formatToolResultForAgent(
        SHELL_TOOL,
        { description: "test", command: "echo test" },
        raw,
      );
      assert.deepEqual(result, raw);
    } finally {
      if (prev === undefined) {
        delete process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION;
      } else {
        process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION = prev;
      }
    }
  });
});

describe("stripToolDisplayDataFromMessages", () => {
  it("removes displayData before model conversion", () => {
    const messages: AgentUIMessage[] = [{
      id: "a1",
      role: "assistant",
      parts: [{
        type: "tool-Shell",
        toolCallId: "c1",
        state: "output-available",
        input: {},
        output: {
          ok: true,
          exitCode: 0,
          data: { output: "small" },
          displayData: { output: "full-body" },
        },
      }],
    }];
    const stripped = stripToolDisplayDataFromMessages(messages);
    const output = stripped[0]!.parts[0] as { output?: Record<string, unknown> };
    assert.equal(output.output?.displayData, undefined);
    assert.deepEqual(output.output?.data, { output: "small" });
  });
});

describe("microcompact with tool summary", () => {
  it("preserves summary in compact placeholder", () => {
    const messages: AgentUIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [{
          type: "tool-qkrpc_action_debug",
          toolCallId: "c1",
          state: "output-available",
          input: { id: "x" },
          output: {
            ok: false,
            exitCode: 1,
            data: {
              eventCount: 3,
              failureLocation: { dataJsonPointer: "/steps/0" },
            },
            summary: "debug failed at /steps/0",
          },
        }],
      },
      { id: "u2", role: "user", parts: [{ type: "text", text: "again" }] },
    ];

    const compacted = microcompactToolOutputs(messages, {
      splitIndex: 2,
      protectRecentRounds: 0,
      minOutputTokens: 1,
    });
    const part = compacted.messages[1]!.parts[0] as { output?: Record<string, unknown> };
    assert.equal(part.output?.compact, true);
    assert.match(String(part.output?.summary), /\/steps\/0/);
    assert.equal(part.output?.dataJsonPointer, "/steps/0");
  });
});
