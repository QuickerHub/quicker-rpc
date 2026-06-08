"use client";

import { isStructuredToolResult } from "@/lib/tool-result";
import type { ToolPopupViewMode } from "@/lib/tool-popup-ui-prefs";
import {
  hasWorkspaceFileEditorPreviewInChat,
  isWorkspaceFileReadTool,
  parseWorkspaceFilePayload,
  resolveWorkspaceFilePopupPreview,
} from "@/lib/workspace-file-tool";
import { parseProgramDiagnosticsFromToolOutput } from "@/lib/program-diagnostics-view";
import { FileEditorCard } from "./FileEditorCard";
import { fileEditorStatFromPreview } from "./FileEditorPreviewPopup";
import { FileListView } from "./FileListView";
import { ProgramDiagnosticsResultView } from "./ProgramDiagnosticsResultView";
import { ToolPayloadView } from "./tool-output";
import { ShellToolPopupBody } from "./ShellToolPopupBody";
import { SHELL_EXEC_TOOL } from "@/lib/shell-tool-constants";

export type { ToolPopupViewMode };

type ToolPopupBodyProps = {
  view: ToolPopupViewMode;
  toolName: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  followTail?: boolean;
};

/** Tool result popup body: structured visual layout or raw request/response. */
export function ToolPopupBody({
  view,
  toolName,
  input,
  output,
  errorText,
  followTail = false,
}: ToolPopupBodyProps) {
  const hasInput = input !== undefined;
  const hasOutput = output !== undefined;
  if (!hasInput && !hasOutput && !errorText) return null;

  if (view === "source") {
    return (
      <div className="tool-body tool-body--debug tool-body--popup-source">
        {hasInput ? (
          <ToolPayloadView
            label="请求"
            value={input}
            rawOnly
            toolName={toolName}
            input={input}
            output={output}
          />
        ) : null}
        {hasOutput ? (
          <ToolPayloadView
            label="结果"
            value={output}
            rawOnly
            toolName={toolName}
            input={input}
            output={output}
            followTail={followTail}
          />
        ) : null}
        {errorText ? <pre className="tool-error">{errorText}</pre> : null}
      </div>
    );
  }

  if (toolName === SHELL_EXEC_TOOL) {
    return (
      <ShellToolPopupBody
        input={input}
        output={output}
        errorText={errorText}
        followTail={followTail}
      />
    );
  }

  const diagnosticsView = parseProgramDiagnosticsFromToolOutput(output);

  if (diagnosticsView) {
    return (
      <div className="tool-body tool-body--debug tool-body--popup-diagnostics">
        {hasInput ? (
          <ToolPayloadView
            label="请求"
            value={input}
            dense
            toolName={toolName}
            input={input}
            output={output}
          />
        ) : null}
        <ProgramDiagnosticsResultView view={diagnosticsView} />
        {errorText ? <pre className="tool-error">{errorText}</pre> : null}
      </div>
    );
  }

  if (isStructuredToolResult(output) && output.ok) {
    const listPayload = parseWorkspaceFilePayload(toolName, output.data);
    if (listPayload?.action === "file-list") {
      return (
        <div className="tool-body tool-body--debug tool-body--popup-file-list">
          {hasInput ? (
            <ToolPayloadView
              label="请求"
              value={input}
              dense
              toolName={toolName}
              input={input}
              output={output}
            />
          ) : null}
          <FileListView payload={listPayload} />
          {errorText ? <pre className="tool-error">{errorText}</pre> : null}
        </div>
      );
    }
  }

  const filePreview = resolveWorkspaceFilePopupPreview(
    toolName,
    input,
    output,
    { streaming: followTail },
  );
  const showFileEditorPopup = Boolean(
    filePreview?.path
    && (
      filePreview.content
      || filePreview.diff
      || isWorkspaceFileReadTool(toolName, input)
      || hasWorkspaceFileEditorPreviewInChat(toolName, input)
    ),
  );

  if (showFileEditorPopup && filePreview) {
    const stat = followTail
      ? undefined
      : fileEditorStatFromPreview(toolName, filePreview, input);
    return (
      <div className="tool-body tool-body--debug tool-body--popup-file-read">
        {hasInput ? (
          <ToolPayloadView
            label="请求"
            value={input}
            dense
            toolName={toolName}
            input={input}
            output={output}
          />
        ) : null}
        <FileEditorCard
          path={filePreview.path}
          content={filePreview.content}
          stat={stat}
          diff={filePreview.diff}
          diffMode="full"
          variant="full"
          showHeader
          showContent
          fillAvailable
          lineNumbers
          foldSnapshot={false}
          running={followTail}
        />
        {filePreview.truncated ? (
          <p className="file-editor-footnote file-editor-footnote--warn">
            内容已截断
            {filePreview.totalChars !== undefined
              ? ` · 文件共 ${filePreview.totalChars} 字符`
              : ""}
          </p>
        ) : null}
        {filePreview.previousSnapshotTruncated ? (
          <p className="file-editor-footnote file-editor-footnote--warn">
            写入前快照已截断，diff 可能不完整
          </p>
        ) : null}
        {errorText ? <pre className="tool-error">{errorText}</pre> : null}
      </div>
    );
  }

  return (
    <div className="tool-body tool-body--debug tool-body--popup-detail">
      {hasInput ? (
        <ToolPayloadView
          label="请求"
          value={input}
          dense
          toolName={toolName}
          input={input}
          output={output}
        />
      ) : null}
      {hasOutput ? (
        <ToolPayloadView
          label="结果"
          value={output}
          dense
          toolName={toolName}
          input={input}
          output={output}
          followTail={followTail}
        />
      ) : null}
      {errorText ? <pre className="tool-error">{errorText}</pre> : null}
    </div>
  );
}
