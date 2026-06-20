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
import { qkrpcActionCommandRunningMeta } from "@/lib/qkrpc-action-tool";
import { ToolSummaryTitle } from "@/components/chat/ToolSummaryTitle";
import {
  ToolResultPopup,
  toolCanShowDetails,
  useToolResultPopup,
} from "./ToolResultPopup";
import { WorkspaceFileOpenRow } from "./WorkspaceFileOpenRow";
import { WorkspaceFileEditorRow } from "./WorkspaceFileToolBody";
import { WorkspaceFileReadRow } from "./WorkspaceFileReadRow";
import { ShellToolRow } from "./ShellToolRow";
import { isShellToolName } from "@/lib/host-tool-constants";
import { summarizeShellToolInput } from "@/lib/shell-tool-view";
import { ActionTraceToolSync } from "./ActionTraceToolSync";
import { AskQuestionToolRow } from "./AskQuestionToolRow";
import { ASK_QUESTION_TOOL } from "@/lib/ask-question-tool";

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
  const displayName = formatToolDisplayName(name, input, output);
  const isRunning =
    state === "input-streaming" || state === "input-available";
  const summary =
    output !== undefined
    && (state === "output-available" || hasFailedStructuredToolOutput(output))
      ? summarizeToolOutput(name, output, input)
      : null;
  const runningMeta =
    isRunning && isShellToolName(name)
      ? summarizeShellToolInput(input)
      : isRunning && isWorkspaceExplorerFileTool(name, input)
        ? workspaceFileRunningMeta(name, input)
        : isRunning
          ? qkrpcActionCommandRunningMeta(name, input)
          : null;
  const meta = runningMeta ?? buildToolSummaryMeta(state, summary, name);
  const errorText = "errorText" in part ? part.errorText : undefined;
  const isError =
    state === "output-error" || hasFailedStructuredToolOutput(output);

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

  const traceSync = (
    <ActionTraceToolSync
      toolName={name}
      input={input}
      output={output}
      isRunning={isRunning}
    />
  );

  if (name === ASK_QUESTION_TOOL && toolCallId) {
    return (
      <AskQuestionToolRow
        toolCallId={toolCallId}
        state={state}
        input={input}
        output={output}
        inBatch={inBatch}
        errorText={errorText}
      />
    );
  }

  if (isShellToolName(name)) {
    return (
      <>
        {traceSync}
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
      </>
    );
  }

  if (
    shouldUseStaticToolRow({
      hasFileEditorPreview: hasWorkspaceFileEditorPreview,
      hasReadFilePreview: hasReadFilePreview,
      isWorkspaceFileOpenRow,
    })
  ) {
    return (
      <>
        {traceSync}
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
      </>
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
    <>
      {traceSync}
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
    </>
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
      {popup.open ? (
        <ToolResultPopup
          open
          onClose={popup.closePopup}
          title={displayName}
          subtitle={meta}
          toolName={toolName}
          input={input}
          output={output}
          errorText={errorText}
          followTail={isRunning}
        />
      ) : null}
    </>
  );
}
