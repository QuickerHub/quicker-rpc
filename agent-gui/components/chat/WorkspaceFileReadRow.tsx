"use client";

import { memo, useMemo } from "react";
import {
  getWorkspaceFileEditorPreview,
  isWorkspaceReadDataSummaryResult,
  shouldShowFileEditorCodeBlockInChat,
} from "@/lib/workspace-file-tool";
import { FileEditorCard } from "./FileEditorCard";
import { fileEditorStatFromPreview } from "./FileEditorPreviewPopup";
import { ToolSummaryTitle } from "@/components/chat/ToolSummaryTitle";
import { type QkrpcToolResult } from "./tool-output";
import {
  ToolDetailsIconButton,
  ToolResultPopup,
  toolCanShowDetails,
  useToolResultPopup,
} from "./ToolResultPopup";

type WorkspaceFileReadRowProps = {
  toolName: string;
  displayName: string;
  meta: string;
  state: string;
  input?: unknown;
  output?: QkrpcToolResult;
  running?: boolean;
  inBatch?: boolean;
  errorText?: string;
};

/** Chat read-data snapshot: tool output only, no explorer context subscription. */
function WorkspaceFileReadRowInner({
  toolName,
  displayName,
  meta,
  state,
  input,
  output,
  running = false,
  inBatch = false,
  errorText,
}: WorkspaceFileReadRowProps) {
  const popup = useToolResultPopup();
  const canShowDetails = toolCanShowDetails(input, output, errorText, running);
  const failed = output && !output.ok;

  const preview = useMemo(
    () =>
      getWorkspaceFileEditorPreview(
        toolName,
        input,
        output?.ok ? output.data : undefined,
      ),
    [toolName, input, output],
  );

  const readStat = useMemo(
    () =>
      preview && output?.ok
        ? fileEditorStatFromPreview(toolName, preview, input)
        : undefined,
    [toolName, preview, input, output],
  );

  const showCode = shouldShowFileEditorCodeBlockInChat(toolName);
  const isDataSummary =
    toolName === "workspace_action_read_data"
    && output?.ok
    && isWorkspaceReadDataSummaryResult(output.data);
  const showInlinePreview = Boolean(preview && showCode && !isDataSummary);

  return (
    <>
    <div
      className={`tool-card tool-card--file-read tool-card--preview tool-card--with-details${inBatch ? " tool-card--nested" : ""}${running ? " tool-card--running" : ""}`}
    >
      <div className="tool-card-actions tool-card-actions--summary">
        <div className="tool-summary tool-summary--static">
          <ToolSummaryTitle
            displayName={displayName}
            meta={meta}
            isRunning={running}
            state={state}
            showChevron={false}
          />
        </div>
        {canShowDetails ? (
          <ToolDetailsIconButton onClick={popup.openPopup} />
        ) : null}
      </div>
      {showInlinePreview ? (
        <div className="tool-body tool-body--file-read">
          <FileEditorCard
            path={preview!.path}
            content={preview!.content}
            running={running}
            stat={readStat}
            variant="compact"
            foldSnapshot={false}
            showContent
            showHeader={false}
          />
          {preview.truncated ? (
            <p className="file-editor-footnote file-editor-footnote--warn">
              内容已截断
              {preview.totalChars !== undefined
                ? ` · 文件共 ${preview.totalChars} 字符`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}
      {failed ? (
        <p className="file-editor-footnote file-editor-footnote--err">
          {typeof output?.data === "object"
          && output.data !== null
          && "errorMessage" in output.data
          && typeof (output.data as { errorMessage: unknown }).errorMessage === "string"
            ? (output.data as { errorMessage: string }).errorMessage
            : output?.stderr ?? "操作失败"}
        </p>
      ) : null}
      {errorText ? <pre className="tool-error">{errorText}</pre> : null}
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
      followTail={running}
    />
    </>
  );
}

export const WorkspaceFileReadRow = memo(WorkspaceFileReadRowInner);
