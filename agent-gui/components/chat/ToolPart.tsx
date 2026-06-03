"use client";

import { memo } from "react";
import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type ChatAddToolApproveResponseFunction,
  type UIMessage,
} from "ai";
import {
  hasWorkspaceFileEditorPreviewInChat,
  isWorkspaceExplorerFileTool,
  isWorkspaceFileEditorTool,
  isWorkspaceFileReadTool,
  workspaceFileRunningMeta,
} from "@/lib/workspace-file-tool";
import { shouldUseStaticToolRow } from "@/lib/tool-display";
import {
  buildToolSummaryMeta,
  formatToolDisplayName,
  isQkrpcToolResult,
  summarizeToolOutput,
} from "./tool-output";
import { ToolApprovalActions } from "./ToolApprovalActions";
import { parseDocsGetDoc } from "@/lib/docs-tool";
import { useDocsViewer } from "@/lib/docs-viewer";
import { ToolSummaryTitle } from "@/components/chat/ToolSummaryTitle";
import { WorkspaceFileOpenRow } from "./WorkspaceFileOpenRow";
import { WorkspaceFileEditorRow } from "./WorkspaceFileToolBody";
import { WorkspaceFileReadRow } from "./WorkspaceFileReadRow";
import { useWorkspaceExplorerActions } from "@/lib/workspace-explorer";

type Part = UIMessage["parts"][number];

type ToolPartProps = {
  messageId: string;
  partIndex: number;
  part: Part;
  inBatch?: boolean;
  addToolApprovalResponse?: ChatAddToolApproveResponseFunction;
  approvalDisabled?: boolean;
};

function ToolPartInner({
  partIndex,
  part,
  inBatch = false,
  addToolApprovalResponse,
  approvalDisabled,
}: ToolPartProps) {
  if (!isToolOrDynamicToolUIPart(part)) return null;

  const name = getToolOrDynamicToolName(part);
  const state = "state" in part ? part.state : "unknown";
  const input = "input" in part ? part.input : undefined;
  const output =
    "output" in part && part.output !== undefined ? part.output : undefined;
  const displayName = formatToolDisplayName(name);
  const isRunning =
    state === "input-streaming" || state === "input-available";
  const summary =
    state === "output-available" && output !== undefined
      ? summarizeToolOutput(name, output, input)
      : null;
  const runningMeta =
    isRunning && isWorkspaceExplorerFileTool(name)
      ? workspaceFileRunningMeta(name, input)
      : null;
  const meta = runningMeta ?? buildToolSummaryMeta(state, summary);
  const errorText = "errorText" in part ? part.errorText : undefined;

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

  const isWorkspaceFile = isWorkspaceExplorerFileTool(name);
  const workspaceFileOutput =
    output !== undefined && isQkrpcToolResult(output) ? output : undefined;
  const hasWorkspaceFileEditorPreview =
    hasWorkspaceFileEditorPreviewInChat(name)
    && (workspaceFileOutput !== undefined || isRunning);
  const hasReadFilePreview =
    isWorkspaceFileReadTool(name)
    && (workspaceFileOutput !== undefined || isRunning);
  const isWorkspaceFileOpenRow =
    isWorkspaceFile
    && !isWorkspaceFileEditorTool(name)
    && Boolean(workspaceFileOutput)
    && !needsApprovalUi;

  if (needsApprovalUi) {
    return (
      <div
        className={`tool-card tool-card--approval${inBatch ? " tool-card--nested" : ""}`}
      >
        <div className="tool-summary tool-summary--static">
          <ToolSummaryTitle
            displayName={displayName}
            meta={meta}
            isRunning={isRunning}
            state={state}
            showChevron={false}
          />
        </div>
        <div className="tool-body tool-body--approval">
          <ToolApprovalActions
            toolName={name}
            input={input}
            approvalId={part.approval!.id}
            addToolApprovalResponse={addToolApprovalResponse}
            disabled={approvalDisabled}
          />
        </div>
        {errorText ? <pre className="tool-error">{errorText}</pre> : null}
      </div>
    );
  }

  if (
    shouldUseStaticToolRow({
      needsApprovalUi: false,
      hasFileEditorPreview: hasWorkspaceFileEditorPreview && !needsApprovalUi,
      hasReadFilePreview: hasReadFilePreview && !needsApprovalUi,
      isDocsOpenable: isDocsOpenable && isQkrpcToolResult(output),
      isWorkspaceFileOpenRow,
    })
  ) {
    return (
      <StaticToolRow
        displayName={displayName}
        meta={meta}
        isRunning={isRunning}
        state={state}
        inBatch={inBatch}
        errorText={errorText}
      />
    );
  }

  if (isDocsOpenable && docsDoc && isQkrpcToolResult(output)) {
    return (
      <DocsToolOpenRow
        displayName={displayName}
        meta={meta}
        isRunning={isRunning}
        state={state}
        doc={docsDoc}
        inBatch={inBatch}
        errorText={errorText}
      />
    );
  }

  if (hasReadFilePreview) {
    return (
      <WorkspaceFileReadRow
        toolName={name}
        displayName={displayName}
        meta={meta}
        state={state}
        input={input}
        output={workspaceFileOutput}
        running={isRunning}
        inBatch={inBatch}
        errorText={errorText}
      />
    );
  }

  if (hasWorkspaceFileEditorPreview) {
    return (
      <WorkspaceFileEditorRow
        toolName={name}
        displayName={displayName}
        meta={meta}
        input={input}
        output={workspaceFileOutput}
        running={isRunning}
        inBatch={inBatch}
        errorText={errorText}
      />
    );
  }

  if (isWorkspaceFileOpenRow && workspaceFileOutput) {
    return (
      <WorkspaceFileOpenRow
        toolName={name}
        displayName={displayName}
        meta={meta}
        isRunning={isRunning}
        state={state}
        input={input}
        output={workspaceFileOutput}
        inBatch={inBatch}
        errorText={errorText}
      />
    );
  }

  return (
    <StaticToolRow
      displayName={displayName}
      meta={meta}
      isRunning={isRunning}
      state={state}
      inBatch={inBatch}
      errorText={errorText}
    />
  );
}

export const ToolPart = memo(ToolPartInner);

function StaticToolRow({
  displayName,
  meta,
  isRunning,
  state,
  inBatch,
  errorText,
}: {
  displayName: string;
  meta: string;
  isRunning: boolean;
  state: string;
  inBatch?: boolean;
  errorText?: string;
}) {
  return (
    <div
      className={`tool-card tool-card--summary-only${inBatch ? " tool-card--nested" : ""}`}
    >
      <div className="tool-summary tool-summary--static">
        <ToolSummaryTitle
          displayName={displayName}
          meta={meta}
          isRunning={isRunning}
          state={state}
          showChevron={false}
        />
      </div>
      {errorText ? <pre className="tool-error">{errorText}</pre> : null}
    </div>
  );
}

function DocsToolOpenRow({
  displayName,
  meta,
  isRunning,
  state,
  doc,
  inBatch,
  errorText,
}: {
  displayName: string;
  meta: string;
  isRunning: boolean;
  state: string;
  doc: NonNullable<ReturnType<typeof parseDocsGetDoc>>;
  inBatch?: boolean;
  errorText?: string;
}) {
  const { openDoc, activeTopicId } = useDocsViewer();
  const { setPanelOpen } = useWorkspaceExplorerActions();
  const isActive = activeTopicId === doc.topic;

  const handleOpen = () => {
    openDoc(doc);
    setPanelOpen(true);
  };

  return (
    <div
      className={`tool-card tool-card--docs tool-card--docs-open tool-card--preview${inBatch ? " tool-card--nested" : ""}${isActive ? " tool-card--docs-active" : ""}`}
    >
      <button
        type="button"
        className="tool-docs-open-btn"
        onClick={handleOpen}
        aria-label={`在右侧打开 ${doc.title}`}
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
      {errorText ? <pre className="tool-error">{errorText}</pre> : null}
    </div>
  );
}
