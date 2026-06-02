"use client";

import { useEffect, useState } from "react";
import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type ChatAddToolApproveResponseFunction,
  type UIMessage,
} from "ai";
import { isActionListTool } from "@/lib/action-list";
import {
  shouldDefaultExpandToolDetails,
  toolHasInlinePreview,
} from "@/lib/tool-display";
import {
  ActionListToolBody,
  buildToolSummaryMeta,
  DocsToolBody,
  formatToolDisplayName,
  isQkrpcToolResult,
  summarizeToolOutput,
  ToolMoreDetails,
  ToolPayloadView,
  type QkrpcToolResult,
} from "./tool-output";
import { ToolApprovalActions } from "./ToolApprovalActions";
import { parseDocsGetDoc, type DocsGetDoc } from "@/lib/docs-tool";
import { useDocsViewer } from "@/lib/docs-viewer";

type Part = UIMessage["parts"][number];

type ToolPartProps = {
  part: Part;
  /** Nested inside a {@link ToolBatchGroup}. */
  inBatch?: boolean;
  batchOpen?: boolean;
  addToolApprovalResponse?: ChatAddToolApproveResponseFunction;
  approvalDisabled?: boolean;
};

function ToolSummaryTitle({
  displayName,
  meta,
  isRunning,
  state,
  showChevron,
}: {
  displayName: string;
  meta: string;
  isRunning: boolean;
  state: string;
  showChevron?: boolean;
}) {
  return (
    <span className="tool-title">
      <span className="tool-name">{displayName}</span>
      <span
        className={`tool-meta${isRunning ? " tool-meta--running" : ""}${state === "output-error" ? " tool-meta--err" : ""}${state === "approval-requested" ? " tool-meta--approval" : ""}`}
      >
        {meta}
      </span>
      {showChevron !== false && <span className="tool-chevron" aria-hidden />}
    </span>
  );
}

export function ToolPart({
  part,
  inBatch = false,
  batchOpen = true,
  addToolApprovalResponse,
  approvalDisabled,
}: ToolPartProps) {
  if (!isToolOrDynamicToolUIPart(part)) return null;

  const name = getToolOrDynamicToolName(part);
  const state = "state" in part ? part.state : "unknown";
  const displayName = formatToolDisplayName(name);

  const output =
    "output" in part && part.output !== undefined ? part.output : undefined;
  const summary =
    state === "output-available" && output !== undefined
      ? summarizeToolOutput(name, output)
      : null;

  const meta = buildToolSummaryMeta(state, summary);
  const isRunning =
    state === "input-streaming" || state === "input-available";

  const isActionList =
    isActionListTool(name)
    && output !== undefined
    && isQkrpcToolResult(output);

  const isDocsGet =
    name === "docs_get"
    && output !== undefined
    && isQkrpcToolResult(output);

  const docsDoc = isDocsGet && output ? parseDocsGetDoc(output) : null;
  const isDocsOpenable = Boolean(docsDoc);

  const needsApprovalUi =
    state === "approval-requested"
    && "approval" in part
    && part.approval?.id
    && addToolApprovalResponse;

  const needsAttention =
    isRunning
    || state === "approval-requested"
    || state === "output-error";
  const isTerminal =
    state === "output-available" || state === "output-denied";

  const hasInlinePreview =
    toolHasInlinePreview(name)
    && isActionList
    && output !== undefined
    && isQkrpcToolResult(output);

  const [open, setOpen] = useState(() => {
    if (hasInlinePreview) return false;
    if (inBatch && !batchOpen) return false;
    return shouldDefaultExpandToolDetails(state, Boolean(needsApprovalUi));
  });

  useEffect(() => {
    if (needsApprovalUi || state === "output-error") {
      setOpen(true);
      return;
    }
    if (hasInlinePreview) {
      setOpen(false);
      return;
    }
    if (inBatch && !batchOpen) {
      setOpen(false);
      return;
    }
    if (isTerminal && !needsAttention) {
      setOpen(false);
    }
  }, [
    hasInlinePreview,
    inBatch,
    batchOpen,
    isTerminal,
    needsAttention,
    needsApprovalUi,
    state,
  ]);

  if (isDocsOpenable && docsDoc && isQkrpcToolResult(output)) {
    return (
      <DocsToolOpenRow
        displayName={displayName}
        meta={meta}
        isRunning={isRunning}
        state={state}
        doc={docsDoc}
        inBatch={inBatch}
        input={"input" in part ? part.input : undefined}
        output={output}
        errorText={"errorText" in part ? part.errorText : undefined}
      />
    );
  }

  if (hasInlinePreview) {
    return (
      <details
        className={`tool-card tool-card--action-list tool-card--preview${inBatch ? " tool-card--nested" : ""}${needsApprovalUi ? " tool-card--approval" : ""}${open ? "" : " tool-card--collapsed"}`}
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
      >
        <summary className="tool-summary">
          <ToolSummaryTitle
            displayName={displayName}
            meta={meta}
            isRunning={isRunning}
            state={state}
          />
        </summary>
        {open && needsApprovalUi && (
          <div className="tool-body tool-body--approval">
            <ToolApprovalActions
              toolName={name}
              input={"input" in part ? part.input : undefined}
              approvalId={part.approval!.id}
              addToolApprovalResponse={addToolApprovalResponse}
              disabled={approvalDisabled}
            />
          </div>
        )}
        {open && !needsApprovalUi && output && (
          <div className="tool-preview tool-body--action-list">
            <ActionListToolBody
              input={"input" in part ? part.input : undefined}
              output={output}
              toolName={name}
            />
          </div>
        )}
        {open && "errorText" in part && part.errorText && (
          <pre className="tool-error">{part.errorText}</pre>
        )}
      </details>
    );
  }

  return (
    <details
      className={`tool-card${inBatch ? " tool-card--nested" : ""}${isDocsGet ? " tool-card--docs" : ""}${needsApprovalUi ? " tool-card--approval" : ""}${open ? "" : " tool-card--collapsed"}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="tool-summary">
        <ToolSummaryTitle
          displayName={displayName}
          meta={meta}
          isRunning={isRunning}
          state={state}
        />
      </summary>

      {open && (
        <div className="tool-body">
          {needsApprovalUi && (
            <ToolApprovalActions
              toolName={name}
              input={"input" in part ? part.input : undefined}
              approvalId={part.approval!.id}
              addToolApprovalResponse={addToolApprovalResponse}
              disabled={approvalDisabled}
            />
          )}

          {isDocsGet ? (
            <DocsToolBody
              input={"input" in part ? part.input : undefined}
              output={output as QkrpcToolResult}
              toolName={name}
            />
          ) : !needsApprovalUi ? (
            <>
              {"input" in part && part.input !== undefined && (
                <ToolPayloadView
                  label="请求"
                  value={part.input}
                  compact
                  followTail={isRunning}
                />
              )}

              {output !== undefined && (
                <ToolPayloadView
                  label="结果"
                  value={output}
                  compact
                  toolName={name}
                  followTail={isRunning}
                />
              )}
            </>
          ) : null}

          {"errorText" in part && part.errorText && (
            <pre className="tool-error">{part.errorText}</pre>
          )}
        </div>
      )}
    </details>
  );
}

function DocsToolOpenRow({
  displayName,
  meta,
  isRunning,
  state,
  doc,
  inBatch,
  input,
  output,
  errorText,
}: {
  displayName: string;
  meta: string;
  isRunning: boolean;
  state: string;
  doc: DocsGetDoc;
  inBatch?: boolean;
  input?: unknown;
  output: QkrpcToolResult;
  errorText?: string;
}) {
  const { openDoc, activeTabId } = useDocsViewer();
  const isActive = activeTabId === doc.topic;

  return (
    <div
      className={`tool-card tool-card--docs tool-card--docs-open tool-card--preview${inBatch ? " tool-card--nested" : ""}${isActive ? " tool-card--docs-active" : ""}`}
    >
      <button
        type="button"
        className="tool-docs-open-btn"
        onClick={() => openDoc(doc)}
        aria-label={`在标签页中打开 ${doc.title}`}
      >
        <span className="tool-title">
          <span className="tool-name">{displayName}</span>
          <span
            className={`tool-meta${isRunning ? " tool-meta--running" : ""}${state === "output-error" ? " tool-meta--err" : ""}`}
          >
            {meta}
          </span>
        </span>
      </button>
      <ToolMoreDetails input={input} output={output} />
      {errorText && <pre className="tool-error">{errorText}</pre>}
    </div>
  );
}
