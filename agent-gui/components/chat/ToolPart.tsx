"use client";

import { memo } from "react";
import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import {
  hasWorkspaceFileEditorPreviewInChat,
  isWorkspaceExplorerFileTool,
  isWorkspaceFileEditorTool,
  isWorkspaceFileReadTool,
  workspaceFileRunningMeta,
} from "@/lib/workspace-file-tool";
import {
  hasFailedStructuredToolOutput,
  shouldUseStaticToolRow,
} from "@/lib/tool-display";
import {
  buildToolSummaryMeta,
  formatToolDisplayName,
  isQkrpcToolResult,
  summarizeToolOutput,
} from "./tool-output";
import { parseDocsGetDoc, isDocsGetOpenableTool } from "@/lib/docs-tool";
import { useDocsViewer } from "@/lib/docs-viewer";
import { getToolMeta } from "@/lib/tool-registry";
import { ToolSummaryTitle } from "@/components/chat/ToolSummaryTitle";
import { DocsToolPopup } from "./DocsToolPopup";
import {
  ToolResultPopup,
  toolCanShowDetails,
  useToolResultPopup,
} from "./ToolResultPopup";
import { WorkspaceFileOpenRow } from "./WorkspaceFileOpenRow";
import { WorkspaceFileEditorRow } from "./WorkspaceFileToolBody";
import { WorkspaceFileReadRow } from "./WorkspaceFileReadRow";
import { ShellToolRow } from "./ShellToolRow";
import { SHELL_EXEC_TOOL } from "@/lib/shell-tool-constants";
import { summarizeShellToolInput } from "@/lib/shell-tool-view";
import { useWorkspaceExplorerActions } from "@/lib/workspace-explorer";

type Part = UIMessage["parts"][number];

type ToolPartProps = {
  messageId: string;
  partIndex: number;
  part: Part;
  inBatch?: boolean;
};

function ToolPartInner({
  partIndex,
  part,
  inBatch = false,
}: ToolPartProps) {
  if (!isToolOrDynamicToolUIPart(part)) return null;

  const name = getToolOrDynamicToolName(part);
  const state = "state" in part ? part.state : "unknown";
  const input = "input" in part ? part.input : undefined;
  const output =
    "output" in part && part.output !== undefined ? part.output : undefined;
  const displayName = formatToolDisplayName(name, input);
  const isRunning =
    state === "input-streaming" || state === "input-available";
  const summary =
    output !== undefined
    && (state === "output-available" || hasFailedStructuredToolOutput(output))
      ? summarizeToolOutput(name, output, input)
      : null;
  const runningMeta =
    isRunning && name === SHELL_EXEC_TOOL
      ? summarizeShellToolInput(input)
      : isRunning && isWorkspaceExplorerFileTool(name, input)
        ? workspaceFileRunningMeta(name, input)
        : null;
  const meta = runningMeta ?? buildToolSummaryMeta(state, summary);
  const errorText = "errorText" in part ? part.errorText : undefined;
  const isError =
    state === "output-error" || hasFailedStructuredToolOutput(output);
  const isDocsWithMarkdown =
    isDocsGetOpenableTool(name, input)
    && output !== undefined
    && isQkrpcToolResult(output);
  const docsDoc =
    isDocsWithMarkdown && output ? parseDocsGetDoc(output) : null;
  const isDocsOpenable = Boolean(docsDoc);

  const isWorkspaceFile = isWorkspaceExplorerFileTool(name, input);
  const workspaceFileOutput =
    output !== undefined && isQkrpcToolResult(output) ? output : undefined;
  const hasWorkspaceFileEditorPreview =
    hasWorkspaceFileEditorPreviewInChat(name, input)
    && (workspaceFileOutput !== undefined || isRunning);
  const hasReadFilePreview =
    isWorkspaceFileReadTool(name, input)
    && (workspaceFileOutput !== undefined || isRunning);
  const isWorkspaceFileOpenRow =
    isWorkspaceFile
    && !isWorkspaceFileEditorTool(name, input)
    && Boolean(workspaceFileOutput);

  const toolCallId =
    "toolCallId" in part && typeof part.toolCallId === "string"
      ? part.toolCallId
      : undefined;

  if (name === SHELL_EXEC_TOOL) {
    return (
      <ShellToolRow
        state={state}
        input={input}
        output={
          output !== undefined && isQkrpcToolResult(output) ? output : undefined
        }
        running={isRunning}
        inBatch={inBatch}
        errorText={errorText}
        toolCallId={toolCallId}
      />
    );
  }

  if (
    shouldUseStaticToolRow({
      hasFileEditorPreview: hasWorkspaceFileEditorPreview,
      hasReadFilePreview: hasReadFilePreview,
      isDocsOpenable: isDocsOpenable && isQkrpcToolResult(output),
      isWorkspaceFileOpenRow,
    })
  ) {
    return (
      <PopupToolRow
        toolName={name}
        displayName={displayName}
        meta={meta}
        isRunning={isRunning}
        state={state}
        isError={isError}
        input={input}
        output={output}
        errorText={errorText}
        inBatch={inBatch}
      />
    );
  }

  if (isDocsOpenable && docsDoc && isQkrpcToolResult(output)) {
    return (
      <DocsToolOpenRow
        toolName={name}
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
    <PopupToolRow
      toolName={name}
      displayName={displayName}
      meta={meta}
      isRunning={isRunning}
      state={state}
      isError={isError}
      input={input}
      output={output}
      errorText={errorText}
      inBatch={inBatch}
    />
  );
}

export const ToolPart = memo(ToolPartInner);

function PopupToolRow({
  toolName,
  displayName,
  meta,
  isRunning,
  state,
  isError,
  input,
  output,
  errorText,
  inBatch,
}: {
  toolName: string;
  displayName: string;
  meta: string;
  isRunning: boolean;
  state: string;
  isError?: boolean;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  inBatch?: boolean;
}) {
  const popup = useToolResultPopup();
  const canOpen = toolCanShowDetails(input, output, errorText, isRunning);
  const err = isError ?? state === "output-error";

  return (
    <>
      <div
        className={`tool-card tool-card--summary-only${inBatch ? " tool-card--nested" : ""}${err ? " tool-card--err" : ""}`}
      >
        <button
          type="button"
          className={`tool-summary${canOpen ? "" : " tool-summary--static"}`}
          disabled={!canOpen}
          onClick={() => canOpen && popup.openPopup()}
          aria-label={canOpen ? `查看 ${displayName} 详情` : undefined}
        >
          <ToolSummaryTitle
            displayName={displayName}
            meta={meta}
            isRunning={isRunning}
            state={state}
            isError={err}
            showChevron={canOpen}
          />
        </button>
        {errorText && !canOpen ? (
          <pre className="tool-error">{errorText}</pre>
        ) : null}
      </div>
      <ToolResultPopup
        open={popup.open}
        onClose={popup.closePopup}
        title={displayName}
        subtitle={meta}
        toolName={toolName}
        input={input}
        output={output}
        errorText={errorText}
        followTail={isRunning}
      />
    </>
  );
}

function DocsToolOpenRow({
  toolName,
  isRunning,
  state,
  doc,
  inBatch,
  errorText,
}: {
  toolName: string;
  isRunning: boolean;
  state: string;
  doc: NonNullable<ReturnType<typeof parseDocsGetDoc>>;
  inBatch?: boolean;
  errorText?: string;
}) {
  const { openDoc } = useDocsViewer();
  const { setPanelOpen } = useWorkspaceExplorerActions();
  const popup = useToolResultPopup();
  const toolLabel = getToolMeta(toolName)?.label ?? "指南";
  const canOpen = Boolean(doc.markdown?.trim()) && !isRunning;

  const handleOpenInExplorer = () => {
    openDoc(doc);
    setPanelOpen(true);
    popup.closePopup();
  };

  return (
    <>
      <div
        className={`tool-card tool-card--docs tool-card--docs-open tool-card--preview${inBatch ? " tool-card--nested" : ""}`}
      >
        <button
          type="button"
          className={`tool-summary tool-docs-open-btn${canOpen ? "" : " tool-summary--static"}`}
          disabled={!canOpen}
          onClick={() => canOpen && popup.openPopup()}
          aria-label={canOpen ? `查看 ${doc.title}` : undefined}
        >
          <ToolSummaryTitle
            displayName={doc.title}
            meta={doc.topic}
            isRunning={isRunning}
            state={state}
            showChevron={canOpen}
          />
        </button>
        {errorText ? <pre className="tool-error">{errorText}</pre> : null}
      </div>
      <DocsToolPopup
        open={popup.open}
        onClose={popup.closePopup}
        doc={doc}
        toolLabel={toolLabel}
        onOpenInExplorer={handleOpenInExplorer}
      />
    </>
  );
}
