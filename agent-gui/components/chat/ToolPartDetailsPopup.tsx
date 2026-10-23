"use client";

import { useCallback } from "react";
import {
  basenamePath,
  formatWorkspacePathLabel,
  getWorkspaceFileEditorPreview,
  hasWorkspaceFileEditorPreviewInChat,
  isWorkspaceExplorerFileTool,
} from "@/lib/workspace-file-tool";
import { useWorkspaceExplorerActions } from "@/lib/workspace-explorer";
import { FileEditorPopupContent, fileEditorStatFromPreview } from "./FileEditorPreviewPopup";
import { isQkrpcToolResult } from "./tool-output";
import { ToolResultPopup, type ToolResultPopupControl } from "./ToolResultPopup";

/** A call keeps one dialog while its row changes from partial input to a preview. */
export function ToolPartDetailsPopup({
  popup, toolName, displayName, meta, input, output, errorText, running,
}: {
  popup: ToolResultPopupControl;
  toolName: string;
  displayName: string;
  meta: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  running: boolean;
}) {
  const structuredOutput = isQkrpcToolResult(output) ? output : undefined;
  const preview = hasWorkspaceFileEditorPreviewInChat(toolName, input)
    ? getWorkspaceFileEditorPreview(toolName, input, structuredOutput?.ok ? structuredOutput.data : undefined, { streaming: running })
    : null;
  const { openFileFromTool, revealPath, setPanelOpen } = useWorkspaceExplorerActions();
  const handleOpenInExplorer = useCallback(() => {
    if (!preview?.path) return;
    if (structuredOutput?.ok && isWorkspaceExplorerFileTool(toolName, input)) {
      openFileFromTool(toolName, input, structuredOutput);
    } else {
      revealPath(preview.path);
      setPanelOpen(true);
    }
  }, [preview?.path, structuredOutput, toolName, input, openFileFromTool, revealPath, setPanelOpen]);
  const stat = preview && !running ? fileEditorStatFromPreview(toolName, preview, input) : undefined;
  const diffCount = stat ? (stat.addLines ?? 0) + (stat.removeLines ?? 0) : 0;
  const subtitle = preview
    ? `${formatWorkspacePathLabel(preview.path)}${diffCount > 0 ? ` · +${stat?.addLines ?? 0} -${stat?.removeLines ?? 0}` : ""}`
    : meta;

  return (
    <ToolResultPopup
      open={popup.open}
      onClose={popup.closePopup}
      title={preview ? basenamePath(preview.path) : displayName}
      subtitle={subtitle}
      toolName={toolName}
      input={input}
      output={output}
      errorText={errorText}
      followTail={running}
      panelClassName={preview ? "tool-file-editor-popup-panel" : undefined}
      bodyClassName={preview ? "tool-file-editor-popup-body" : undefined}
      headerExtra={preview ? (
        <button type="button" className="tool-docs-popup-side-btn" onClick={handleOpenInExplorer}>
          侧栏打开
        </button>
      ) : undefined}
      visualContent={preview ? <FileEditorPopupContent {...preview} stat={stat} /> : undefined}
    />
  );
}
