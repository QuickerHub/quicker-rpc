"use client";

import { useCallback, useMemo } from "react";
import {
  getWorkspaceFileEditorPreview,
  isWorkspaceExplorerFileTool,
  isWorkspaceFileEditorTool,
  isWorkspaceFileReadTool,
  parseWorkspaceFilePayload,
  shouldFoldFileSnapshotInChat,
  shouldShowFileEditorCodeBlockInChat,
  type WorkspaceFilePayload,
} from "@/lib/workspace-file-tool";
import { useWorkspaceExplorerActions } from "@/lib/workspace-explorer";
import { FileEditorCard } from "./FileEditorCard";
import {
  FileEditorPreviewPopup,
  fileEditorStatFromPreview,
} from "./FileEditorPreviewPopup";
import {
  formatToolDisplayName,
  ToolPayloadView,
  type QkrpcToolResult,
} from "./tool-output";
import {
  ToolDetailsIconButton,
  ToolResultPopup,
  toolCanShowDetails,
  useToolResultPopup,
} from "./ToolResultPopup";

function FileListView({ payload }: { payload: Extract<WorkspaceFilePayload, { action: "file-list" }> }) {
  const dirs = payload.entries.filter((e) => e.isDirectory);
  const files = payload.entries.filter((e) => !e.isDirectory);

  return (
    <div className="tool-file-list">
      <div className="file-editor-header file-editor-header--list">
        <span className="file-editor-hash" aria-hidden>
          #
        </span>
        <span className="file-editor-name">{payload.path}</span>
        <span className="file-editor-stat file-editor-stat--neutral">
          {payload.entries.length}
        </span>
      </div>
      <ul className="tool-file-list-entries">
        {dirs.map((e) => (
          <li key={e.path} className="tool-file-list-item tool-file-list-item--dir">
            <span className="tool-file-list-name">{e.name}/</span>
            <span className="tool-file-list-path">{e.path}</span>
          </li>
        ))}
        {files.map((e) => (
          <li key={e.path} className="tool-file-list-item">
            <span className="tool-file-list-name">{e.name}</span>
            <span className="tool-file-list-path">{e.path}</span>
          </li>
        ))}
      </ul>
      {payload.truncated ? (
        <p className="file-editor-footnote file-editor-footnote--warn">目录列表已截断</p>
      ) : null}
      {payload.entries.length === 0 ? (
        <p className="file-editor-footnote">（空目录）</p>
      ) : null}
    </div>
  );
}

function FileEditorPreviewBody({
  toolName,
  summaryMeta,
  headerRunning = false,
  headerError = false,
  input,
  output,
  running = false,
  layout = "chip",
  onOpenPreview,
}: {
  toolName: string;
  summaryMeta: string;
  headerRunning?: boolean;
  headerError?: boolean;
  input?: unknown;
  output?: QkrpcToolResult;
  running?: boolean;
  /** chip: compact file header; details-body: code block only inside tool details */
  layout?: "chip" | "details-body";
  onOpenPreview?: () => void;
}) {
  const preview = getWorkspaceFileEditorPreview(
    toolName,
    input,
    output?.ok ? output.data : undefined,
  );

  if (!preview) return null;

  const embedded = layout === "details-body";
  const showCodeBlock = shouldShowFileEditorCodeBlockInChat(toolName);

  const stat =
    !embedded && showCodeBlock
      ? fileEditorStatFromPreview(toolName, preview, input)
      : undefined;

  return (
    <>
      <FileEditorCard
        path={preview.path}
        content={preview.content}
        running={running}
        stat={stat}
        diff={preview.diff}
        variant="compact"
        foldSnapshot={embedded ? false : shouldFoldFileSnapshotInChat(toolName)}
        showContent={showCodeBlock}
        showHeader={!embedded}
        summaryMeta={embedded || isWorkspaceFileReadTool(toolName) ? "" : summaryMeta}
        headerRunning={headerRunning}
        headerError={headerError}
        onOpenPreview={embedded ? undefined : onOpenPreview}
      />
      {showCodeBlock && preview.truncated ? (
        <p className="file-editor-footnote file-editor-footnote--warn">
          内容已截断
          {preview.totalChars !== undefined
            ? ` · 文件共 ${preview.totalChars} 字符`
            : ""}
        </p>
      ) : null}
      {showCodeBlock && preview.previousSnapshotTruncated ? (
        <p className="file-editor-footnote file-editor-footnote--warn">
          写入前快照已截断，diff 可能不完整
        </p>
      ) : null}
    </>
  );
}

function FileEditorPreviewWithExplorer(
  props: Omit<Parameters<typeof FileEditorPreviewBody>[0], "onOpenPreview">,
) {
  const preview = useMemo(
    () =>
      getWorkspaceFileEditorPreview(
        props.toolName,
        props.input,
        props.output?.ok ? props.output.data : undefined,
      ),
    [props.toolName, props.input, props.output],
  );
  const previewPopup = useToolResultPopup();
  const { openFileFromTool, revealPath, setPanelOpen } = useWorkspaceExplorerActions();

  const handleOpenInExplorer = useCallback(() => {
    if (!preview?.path) return;
    if (props.output?.ok && isWorkspaceExplorerFileTool(props.toolName)) {
      openFileFromTool(props.toolName, props.input, props.output);
    } else {
      revealPath(preview.path);
      setPanelOpen(true);
    }
  }, [
    preview?.path,
    props.output,
    props.toolName,
    props.input,
    openFileFromTool,
    revealPath,
    setPanelOpen,
  ]);

  const popupStat = preview
    ? fileEditorStatFromPreview(props.toolName, preview, props.input)
    : undefined;

  return (
    <>
      <FileEditorPreviewBody
        {...props}
        onOpenPreview={preview ? previewPopup.openPopup : undefined}
      />
      {preview ? (
        <FileEditorPreviewPopup
          open={previewPopup.open}
          onClose={previewPopup.closePopup}
          path={preview.path}
          content={preview.content}
          diff={preview.diff}
          stat={popupStat}
          truncated={preview.truncated}
          totalChars={preview.totalChars}
          previousSnapshotTruncated={preview.previousSnapshotTruncated}
          onOpenInExplorer={handleOpenInExplorer}
        />
      ) : null}
    </>
  );
}

function FileEditorPreview(
  props: Omit<Parameters<typeof FileEditorPreviewBody>[0], "onOpenPreview">,
) {
  if (props.layout === "details-body") {
    return <FileEditorPreviewBody {...props} />;
  }
  return <FileEditorPreviewWithExplorer {...props} />;
}

export { FileEditorPreview };

export function WorkspaceFileEditorRow({
  toolName,
  displayName,
  meta,
  input,
  output,
  running = false,
  inBatch = false,
  errorText,
}: {
  toolName: string;
  displayName: string;
  meta: string;
  input?: unknown;
  output?: QkrpcToolResult;
  running?: boolean;
  inBatch?: boolean;
  errorText?: string;
}) {
  const popup = useToolResultPopup();
  const canShowDetails = toolCanShowDetails(input, output, errorText, running);
  const failed = output && !output.ok;
  return (
    <>
    <div
      className={`tool-card tool-card--file-editor tool-card--preview tool-card--with-details${inBatch ? " tool-card--nested" : ""}${running ? " tool-card--running" : ""}`}
    >
      {canShowDetails ? (
        <div className="tool-card-actions tool-card-actions--corner">
          <ToolDetailsIconButton onClick={popup.openPopup} />
        </div>
      ) : null}
      {failed ? (
        <FileEditorPreview
          toolName={toolName}
          summaryMeta={meta}
          headerRunning={running}
          headerError={failed}
          input={input}
          output={output}
        />
      ) : (
        <FileEditorPreview
          toolName={toolName}
          summaryMeta={meta}
          headerRunning={running}
          headerError={failed}
          input={input}
          output={output}
          running={running}
        />
      )}
      {failed && (
        <p className="file-editor-footnote file-editor-footnote--err">
          {typeof output?.data === "object"
          && output.data !== null
          && "errorMessage" in output.data
          && typeof (output.data as { errorMessage: unknown }).errorMessage === "string"
            ? (output.data as { errorMessage: string }).errorMessage
            : output?.stderr ?? "操作失败"}
        </p>
      )}
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

export function WorkspaceFileToolBody({
  input,
  output,
  toolName,
}: {
  input?: unknown;
  output: QkrpcToolResult;
  toolName: string;
}) {
  if (isWorkspaceFileEditorTool(toolName)) {
    return (
      <WorkspaceFileEditorRow
        toolName={toolName}
        displayName={formatToolDisplayName(toolName)}
        meta=""
        input={input}
        output={output}
      />
    );
  }

  if (!output.ok) {
    const path = typeof input === "object" && input !== null && "path" in input
      ? String((input as { path: unknown }).path ?? "")
      : "";
    const err =
      typeof output.data === "object"
      && output.data !== null
      && "errorMessage" in output.data
      && typeof (output.data as { errorMessage: unknown }).errorMessage === "string"
        ? (output.data as { errorMessage: string }).errorMessage
        : output.stderr;

    return (
      <>
        {path ? (
          <div className="file-editor-header file-editor-header--list">
            <span className="file-editor-hash">#</span>
            <span className="file-editor-name">{path}</span>
          </div>
        ) : null}
        <p className="file-editor-footnote file-editor-footnote--err">{err ?? "操作失败"}</p>
      </>
    );
  }

  const payload = parseWorkspaceFilePayload(toolName, output.data);
  if (!payload) {
    return (
      <ToolPayloadView label="结果" value={output} compact toolName={toolName} />
    );
  }

  if (payload.action === "file-list") {
    return <FileListView payload={payload} />;
  }

  return (
    <FileEditorPreview
        toolName={toolName}
        summaryMeta=""
        input={input}
      output={output}
    />
  );
}
