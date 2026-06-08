"use client";

import { memo, useCallback, useMemo, useState } from "react";
import {
  basenamePath,
  getWorkspaceFileEditorPreview,
  hasWorkspaceFileEditorPreviewInChat,
  isWorkspaceExplorerFileTool,
  isWorkspaceFileEditorTool,
  isWorkspaceFileReadTool,
  parseWorkspaceFilePayload,
  shouldFoldFileSnapshotInChat,
  shouldShowFileEditorCodeBlockInChat,
  type WorkspaceFilePayload,
} from "@/lib/workspace-file-tool";
import { ToolSummaryTitle } from "@/components/chat/ToolSummaryTitle";
import { LineDiffSummary } from "./LineDiffSummary";
import type { FileEditorStat } from "./FileEditorCard";
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
import { FileListView } from "./FileListView";

export { FileListView };

function lineDiffFromStat(
  stat: FileEditorStat | undefined,
): { addLines: number; removeLines: number } | null {
  if (!stat) return null;
  const add = stat.addLines ?? 0;
  const rem = stat.removeLines ?? 0;
  if (add === 0 && rem === 0) return null;
  return { addLines: add, removeLines: rem };
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
  diffOpen,
  onDiffOpenChange,
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
  diffOpen?: boolean;
  onDiffOpenChange?: (open: boolean) => void;
}) {
  const preview = getWorkspaceFileEditorPreview(
    toolName,
    input,
    output?.ok ? output.data : undefined,
    { streaming: running },
  );

  if (!preview) return null;

  const embedded = layout === "details-body";
  const showCodeBlock = shouldShowFileEditorCodeBlockInChat(toolName, input);
  const isWriteEditPreview = hasWorkspaceFileEditorPreviewInChat(toolName, input);
  const foldSnapshot =
    embedded
      ? false
      : !running && shouldFoldFileSnapshotInChat(toolName, input);

  const stat =
    !embedded && showCodeBlock && !running
      ? fileEditorStatFromPreview(toolName, preview, input)
      : undefined;

  const fileName = basenamePath(preview.path);
  const lineDiff = lineDiffFromStat(stat);
  const useToolSummaryRow = foldSnapshot && !embedded && isWriteEditPreview;
  const toolState = running
    ? "input-available"
    : headerError
      ? "output-error"
      : "output-available";

  if (useToolSummaryRow) {
    const open = diffOpen ?? false;
    const setOpen = onDiffOpenChange ?? (() => {});

    return (
      <>
        <button
          type="button"
          className="tool-summary tool-file-edit-summary"
          aria-expanded={open}
          aria-label={open ? `收起 ${fileName} 差异` : `展开 ${fileName} 差异`}
          onClick={() => setOpen(!open)}
        >
          <ToolSummaryTitle
            displayName={fileName}
            meta={lineDiff ? undefined : summaryMeta}
            metaContent={
              lineDiff ? (
                <LineDiffSummary
                  addLines={lineDiff.addLines}
                  removeLines={lineDiff.removeLines}
                />
              ) : undefined
            }
            isRunning={headerRunning}
            state={toolState}
            isError={headerError}
          />
        </button>
        {open && showCodeBlock ? (
          <div className="tool-body tool-body--file-editor-diff">
            <FileEditorCard
              path={preview.path}
              content={preview.content}
              running={running}
              stat={stat}
              diff={preview.diff}
              variant="compact"
              foldSnapshot={false}
              inlineDiffExpanded
              showContent
              showHeader={false}
              headerRunning={headerRunning}
              headerError={headerError}
            />
          </div>
        ) : null}
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

  return (
    <>
      <FileEditorCard
        path={preview.path}
        content={preview.content}
        running={running}
        stat={stat}
        diff={preview.diff}
        variant="compact"
        foldSnapshot={foldSnapshot}
        editActionLabel={isWriteEditPreview && !embedded ? "Edited" : undefined}
        showContent={showCodeBlock}
        showHeader={!embedded}
        summaryMeta={embedded || isWorkspaceFileReadTool(toolName, input) ? "" : summaryMeta}
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

type ToolResultPopupControl = ReturnType<typeof useToolResultPopup>;

function FileEditorPreviewWithExplorer(
  props: Omit<Parameters<typeof FileEditorPreviewBody>[0], "onOpenPreview"> & {
    diffOpen?: boolean;
    onDiffOpenChange?: (open: boolean) => void;
    sharedPopup?: ToolResultPopupControl;
    renderPopup?: boolean;
  },
) {
  const preview = useMemo(
    () =>
      getWorkspaceFileEditorPreview(
        props.toolName,
        props.input,
        props.output?.ok ? props.output.data : undefined,
        { streaming: props.running },
      ),
    [props.toolName, props.input, props.output, props.running],
  );
  const internalPopup = useToolResultPopup();
  const popup = props.sharedPopup ?? internalPopup;
  const renderPopup = props.renderPopup ?? !props.sharedPopup;
  const { openFileFromTool, revealPath, setPanelOpen } = useWorkspaceExplorerActions();

  const handleOpenInExplorer = useCallback(() => {
    if (!preview?.path) return;
    if (props.output?.ok && isWorkspaceExplorerFileTool(props.toolName, props.input)) {
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

  const popupStat = preview && !props.running
    ? fileEditorStatFromPreview(props.toolName, preview, props.input)
    : undefined;

  return (
    <>
      <FileEditorPreviewBody
        {...props}
        onOpenPreview={preview ? popup.openPopup : undefined}
      />
      {renderPopup && preview ? (
        <FileEditorPreviewPopup
          open={popup.open}
          onClose={popup.closePopup}
          path={preview.path}
          content={preview.content}
          diff={preview.diff}
          stat={popupStat}
          truncated={preview.truncated}
          totalChars={preview.totalChars}
          previousSnapshotTruncated={preview.previousSnapshotTruncated}
          onOpenInExplorer={handleOpenInExplorer}
          toolName={props.toolName}
          input={props.input}
          output={props.output}
        />
      ) : null}
    </>
  );
}

function FileEditorPreview(
  props: Omit<Parameters<typeof FileEditorPreviewBody>[0], "onOpenPreview"> & {
    diffOpen?: boolean;
    onDiffOpenChange?: (open: boolean) => void;
    sharedPopup?: ToolResultPopupControl;
    renderPopup?: boolean;
  },
) {
  if (props.layout === "details-body") {
    return <FileEditorPreviewBody {...props} />;
  }
  return <FileEditorPreviewWithExplorer {...props} />;
}

export { FileEditorPreview };

function WorkspaceFileEditorRowInner({
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
  const foldableDiff =
    !running && shouldFoldFileSnapshotInChat(toolName, input);
  const [diffOpen, setDiffOpen] = useState(false);
  const preview = useMemo(
    () =>
      getWorkspaceFileEditorPreview(
        toolName,
        input,
        output?.ok ? output.data : undefined,
        { streaming: running },
      ),
    [toolName, input, output, running],
  );
  const { openFileFromTool, revealPath, setPanelOpen } = useWorkspaceExplorerActions();
  const handleOpenInExplorer = useCallback(() => {
    if (!preview?.path) return;
    if (output?.ok && isWorkspaceExplorerFileTool(toolName, input)) {
      openFileFromTool(toolName, input, output);
    } else {
      revealPath(preview.path);
      setPanelOpen(true);
    }
  }, [
    preview?.path,
    output,
    toolName,
    input,
    openFileFromTool,
    revealPath,
    setPanelOpen,
  ]);
  const popupStat = preview && !running
    ? fileEditorStatFromPreview(toolName, preview, input)
    : undefined;

  return (
    <>
    <div
      className={[
        "tool-card",
        "tool-card--file-editor",
        "tool-card--preview",
        "tool-card--with-details",
        foldableDiff ? "tool-card--file-editor-fold" : "",
        diffOpen ? "tool-card--expanded" : "",
        inBatch ? "tool-card--nested" : "",
        running ? "tool-card--running" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {canShowDetails ? (
        <div className="tool-card-actions tool-card-actions--corner">
          <ToolDetailsIconButton onClick={popup.openPopup} />
        </div>
      ) : null}
      <FileEditorPreview
        toolName={toolName}
        summaryMeta={meta}
        headerRunning={running}
        headerError={Boolean(failed)}
        input={input}
        output={output}
        running={running}
        diffOpen={diffOpen}
        onDiffOpenChange={setDiffOpen}
        sharedPopup={popup}
        renderPopup={false}
      />
      {errorText ? <pre className="tool-error">{errorText}</pre> : null}
    </div>
    {preview ? (
      <FileEditorPreviewPopup
        open={popup.open}
        onClose={popup.closePopup}
        path={preview.path}
        content={preview.content}
        diff={preview.diff}
        stat={popupStat}
        truncated={preview.truncated}
        totalChars={preview.totalChars}
        previousSnapshotTruncated={preview.previousSnapshotTruncated}
        onOpenInExplorer={handleOpenInExplorer}
        toolName={toolName}
        input={input}
        output={output}
      />
    ) : (
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
    )}
    </>
  );
}

export const WorkspaceFileEditorRow = memo(WorkspaceFileEditorRowInner);

export function WorkspaceFileToolBody({
  input,
  output,
  toolName,
}: {
  input?: unknown;
  output: QkrpcToolResult;
  toolName: string;
}) {
  if (isWorkspaceFileEditorTool(toolName, input)) {
    return (
      <WorkspaceFileEditorRow
        toolName={toolName}
        displayName={formatToolDisplayName(toolName, input)}
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

    return (
      <>
        {path ? (
          <div className="file-editor-header file-editor-header--list">
            <span className="file-editor-hash">#</span>
            <span className="file-editor-name">{path}</span>
          </div>
        ) : null}
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
