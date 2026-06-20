import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  analyzeChatThreadExportText,
  formatSessionAnalysisReport,
} from "@/lib/agent-session-analysis";
import { CHAT_THREAD_EXPORT_FORMAT } from "@/lib/chat-thread-export";
import type { AgentUIMessage } from "@/lib/chat-types";

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "../benchmarks/session-exports/conditional-http-minimal.json",
);

const USER_PROMPT =
  "新建动作：变量 url（文本，默认空）。若 url 非空则 GET 该地址并把响应体写入 body；否则提示「请先设置 url」。有 url 时用文本窗口显示 body 前 200 字符。";

function buildMinimalExport(): string {
  const messages: AgentUIMessage[] = [
    {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: USER_PROMPT }],
    },
    {
      id: "a1",
      role: "assistant",
      metadata: {
        model: "test-model",
        inputTokens: 1000,
        outputTokens: 100,
        totalTokens: 1100,
        contextReport: {
          contextWindowTokens: 128000,
          estimatedInputTokens: 12000,
          categories: [
            { id: "system", label: "System prompt", tokens: 4365 },
            { id: "tools", label: "Tool definitions", tokens: 7385 },
            { id: "conversation", label: "Conversation", tokens: 34 },
          ],
        },
        agentTurnState: {
          intent: "action_authoring",
          risk: "write",
          targetRefs: [],
          recommendedToolIds: ["docs", "workspace_program", "qkrpc_step_runner_search"],
          verificationHints: [],
        },
      },
      parts: [
        {
          type: "tool-qkrpc_action_create",
          toolCallId: "tc-err",
          state: "output-error",
          rawInput: { info: '{"title":"x"}' },
          errorText:
            'Invalid input: Expected object, received string at path ["info"]',
        },
        {
          type: "tool-qkrpc_action_create",
          toolCallId: "tc-ok",
          state: "output-available",
          input: { info: { title: "条件HTTP请求" } },
          output: { ok: true, data: { actionId: "a381cb35-03aa-4483-82b5-36c48f514c35" } },
        },
        {
          type: "tool-qkrpc_step_runner_search",
          toolCallId: "tc-search-1",
          state: "output-available",
          input: { query: "sys:showText" },
        },
        {
          type: "tool-qkrpc_step_runner_search",
          toolCallId: "tc-search-dup",
          state: "output-available",
          input: { query: "sys:showText" },
        },
        {
          type: "tool-qkrpc_step_runner_get",
          toolCallId: "tc-get",
          state: "output-available",
          input: { key: "sys:http", controlField: "GET" },
        },
        {
          type: "tool-workspace_program",
          toolCallId: "tc-read",
          state: "output-available",
          input: {
            action: "read_data",
            target: "action",
            id: "a381cb35-03aa-4483-82b5-36c48f514c35",
          },
          output: {
            ok: true,
            data: {
              content: '{\n  "steps": [],\n  "variables": []\n}\n',
            },
          },
        },
        {
          type: "tool-docs",
          toolCallId: "tc-docs-1",
          state: "output-available",
          input: { action: "get", topic: "quicker-authoring-conditional-http" },
        },
        {
          type: "tool-docs",
          toolCallId: "tc-docs-2",
          state: "output-available",
          input: { action: "search", query: "data.json schema" },
        },
        {
          type: "tool-docs",
          toolCallId: "tc-docs-3",
          state: "output-available",
          input: { action: "get", topic: "action-data-schema" },
        },
        {
          type: "tool-workspace_program",
          toolCallId: "tc-write",
          state: "output-available",
          input: { action: "write_data", target: "action" },
        },
        {
          type: "tool-workspace_program",
          toolCallId: "tc-diag",
          state: "output-available",
          input: { action: "diagnostics", target: "action" },
        },
        {
          type: "tool-workspace_program",
          toolCallId: "tc-patch",
          state: "output-available",
          input: { action: "patch", target: "action" },
        },
        {
          type: "tool-workspace_program",
          toolCallId: "tc-diag2",
          state: "output-available",
          input: { action: "diagnostics", target: "action" },
        },
      ],
    },
  ];

  return JSON.stringify({
    format: CHAT_THREAD_EXPORT_FORMAT,
    version: 1,
    exportedAt: "2026-06-19T09:49:07.741Z",
    thread: {
      id: "05a9b10a-1c42-4851-9b4c-da86d89e9a8d",
      title: "新建动作：条件HTTP GET + 文本窗口",
      updatedAt: 1,
    },
    stats: {
      messageCount: 2,
      userTurnCount: 1,
      sessionUsage: {
        inputTokens: 38302,
        outputTokens: 194,
        totalTokens: 38496,
        reasoningTokens: 9,
        assistantTurns: 1,
      },
    },
    messages,
  });
}

test("analyzeChatThreadExportText detects schema error and session rules", () => {
  const result = analyzeChatThreadExportText(buildMinimalExport());

  assert.equal(result.trace.metrics.errorCount, 1);
  assert.equal(result.trace.metrics.retryCount, 1);
  assert.ok(result.trace.findings.some((f) => f.ruleId === "schema-validation-error"));
  assert.ok(result.trace.findings.some((f) => f.ruleId === "C-duplicate-search"));
  assert.ok(result.trace.findings.some((f) => f.ruleId === "create-then-read-data"));
  assert.ok(result.trace.findings.some((f) => f.ruleId === "docs-call-heavy"));
  assert.ok(result.trace.findings.some((f) => f.ruleId === "token-baseline-high"));
  assert.equal(result.trace.traceRubric.passed, true);
  assert.ok(result.optimizationHints.length >= 3);
});

test("formatSessionAnalysisReport includes summary and timeline", () => {
  const result = analyzeChatThreadExportText(buildMinimalExport());
  const report = formatSessionAnalysisReport(result);
  assert.ok(report.includes("# QuickerAgent Session Analysis"));
  assert.ok(report.includes("schema-validation-error"));
  assert.ok(report.includes("qkrpc_action_create"));
});

test("fixture file parses when present", async () => {
  try {
    const text = await readFile(FIXTURE_PATH, "utf8");
    const result = analyzeChatThreadExportText(text);
    assert.equal(result.export.thread.id, "05a9b10a-1c42-4851-9b4c-da86d89e9a8d");
    assert.ok(result.trace.toolCalls.length >= 10);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return;
    }
    throw error;
  }
});

test("optional live export via AGENT_SESSION_EXPORT_PATH", async () => {
  const livePath = process.env.AGENT_SESSION_EXPORT_PATH?.trim();
  if (!livePath) return;

  const text = await readFile(resolve(livePath), "utf8");
  const result = analyzeChatThreadExportText(text);
  assert.ok(result.trace.userPrompt.includes("totalLikes"));
  assert.ok(result.trace.metrics.toolCallCount >= 15);
});
