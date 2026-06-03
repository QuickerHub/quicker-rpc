import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldCollapseToolBatchWhenIdle } from "../components/chat/tool-part-layout.ts";
import {
  hasFailedStructuredToolOutput,
  isSummaryOnlyToolResult,
  parseSingleIdInput,
  shouldOmitCompactToolResultBody,
  shouldShowToolDebugDetails,
  shouldSkipRedundantToolRequest,
  shouldUseStaticToolRow,
} from "./tool-display";

const deleteOutput = {
  ok: true,
  exitCode: 0,
  data: {
    action: "delete",
    message: "动作已删除。",
    actionId: "7fe120c4-cbb1-42cc-b60c-d8c5d961a7c4",
  },
};

test("shouldCollapseToolBatchWhenIdle when all tools finished without errors", () => {
  assert.equal(
    shouldCollapseToolBatchWhenIdle({ allTerminal: true, needsAttention: false }),
    true,
  );
  assert.equal(
    shouldCollapseToolBatchWhenIdle({ allTerminal: true, needsAttention: true }),
    false,
  );
  assert.equal(
    shouldCollapseToolBatchWhenIdle({ allTerminal: false, needsAttention: false }),
    false,
  );
});

test("hasFailedStructuredToolOutput detects ok:false results", () => {
  assert.equal(
    hasFailedStructuredToolOutput({ ok: false, exitCode: 1, data: { error: "x" } }),
    true,
  );
  assert.equal(
    hasFailedStructuredToolOutput({ ok: true, exitCode: 0, data: {} }),
    false,
  );
});

test("shouldShowToolDebugDetails for framework errors and qkrpc failures", () => {
  assert.equal(
    shouldShowToolDebugDetails("output-error", undefined),
    true,
  );
  assert.equal(
    shouldShowToolDebugDetails(
      "output-available",
      { ok: false, exitCode: 1, data: { error: "pipe" } },
    ),
    true,
  );
  assert.equal(
    shouldShowToolDebugDetails(
      "output-available",
      { ok: true, exitCode: 0, data: {} },
    ),
    false,
  );
});

test("shouldUseStaticToolRow defaults to static chat rows", () => {
  assert.equal(
    shouldUseStaticToolRow({
      hasFileEditorPreview: false,
      hasReadFilePreview: false,
      isDocsOpenable: false,
      isWorkspaceFileOpenRow: false,
    }),
    true,
  );
  assert.equal(
    shouldUseStaticToolRow({
      hasFileEditorPreview: true,
      hasReadFilePreview: false,
      isDocsOpenable: false,
      isWorkspaceFileOpenRow: false,
    }),
    false,
  );
});

test("parseSingleIdInput reads a lone id field", () => {
  assert.equal(
    parseSingleIdInput({ id: "7fe120c4-cbb1-42cc-b60c-d8c5d961a7c4" }),
    "7fe120c4-cbb1-42cc-b60c-d8c5d961a7c4",
  );
});

test("shouldSkipRedundantToolRequest skips delete request when result echoes the id", () => {
  assert.equal(
    shouldSkipRedundantToolRequest(
      { id: "7fe120c4-cbb1-42cc-b60c-d8c5d961a7c4" },
      deleteOutput,
    ),
    true,
  );
});

test("isSummaryOnlyToolResult treats successful delete as summary-only", () => {
  assert.equal(
    isSummaryOnlyToolResult(
      "qkrpc_action_delete",
      { id: "7fe120c4-cbb1-42cc-b60c-d8c5d961a7c4" },
      deleteOutput,
    ),
    true,
  );
});

test("shouldOmitCompactToolResultBody omits delete result body when message covers it", () => {
  assert.equal(
    shouldOmitCompactToolResultBody(
      { id: "7fe120c4-cbb1-42cc-b60c-d8c5d961a7c4" },
      deleteOutput,
    ),
    true,
  );
});

test("shouldSkipRedundantToolRequest skips step runner get request when key is in summary", () => {
  assert.equal(
    shouldSkipRedundantToolRequest(
      { key: "sys:getClipboardText" },
      {
        ok: true,
        exitCode: 0,
        data: {
          ok: true,
          action: "step-runner-get",
          payload: {
            success: true,
            schemaJson: JSON.stringify({
              StepRunnerKey: "sys:getClipboardText",
              Name: "获取剪贴板文本",
            }),
          },
        },
      },
    ),
    true,
  );
});

test("isSummaryOnlyToolResult treats successful step runner get as summary-only", () => {
  assert.equal(
    isSummaryOnlyToolResult(
      "qkrpc_step_runner_get",
      { key: "sys:getClipboardText" },
      {
        ok: true,
        exitCode: 0,
        data: {
          ok: true,
          action: "step-runner-get",
          payload: {
            success: true,
            schemaJson: JSON.stringify({
              StepRunnerKey: "sys:getClipboardText",
              Name: "获取剪贴板文本",
            }),
          },
        },
      },
    ),
    true,
  );
});
