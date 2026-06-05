"use client";

import { isStructuredToolResult } from "@/lib/tool-result";
import type { ToolPopupViewMode } from "@/lib/tool-popup-ui-prefs";
import {
  getWorkspaceFileEditorPreview,
  isWorkspaceFileReadTool,
} from "@/lib/workspace-file-tool";
import { parseProgramDiagnosticsFromToolOutput } from "@/lib/program-diagnostics-view";
import { FileEditorCard } from "./FileEditorCard";
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

  const filePreview =
    isWorkspaceFileReadTool(toolName, input)
    && isStructuredToolResult(output)
    && output.ok
      ? getWorkspaceFileEditorPreview(toolName, input, output.data)
      : null;

  if (filePreview?.content) {
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
