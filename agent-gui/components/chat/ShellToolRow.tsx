"use client";

import { memo, useMemo } from "react";
import { useThrottledStreamValue } from "@/lib/use-throttled-stream-value";
import { TerminalOutputEditor } from "@/components/terminal/TerminalOutputEditor";
import {
  ToolDetailsIconButton,
  ToolResultPopup,
  toolCanShowDetails,
  useToolResultPopup,
} from "@/components/chat/ToolResultPopup";
import { type QkrpcToolResult } from "@/components/chat/tool-output";
import {
  formatShellDisplayContent,
  formatShellExitMeta,
  parseShellToolView,
  readShellToolDescription,
} from "@/lib/shell-tool-view";
import { useShellSessionWatch } from "@/lib/use-shell-session-watch";

type ShellToolRowProps = {
  state: string;
  input?: unknown;
  output?: QkrpcToolResult;
  running?: boolean;
  inBatch?: boolean;
  errorText?: string;
  toolCallId?: string;
};

function ShellToolRowInner({
  state,
  input,
  output,
  running = false,
  inBatch = false,
  errorText,
  toolCallId,
}: ShellToolRowProps) {
  const popup = useToolResultPopup();
  const watchEnabled = Boolean(toolCallId) && (running || output === undefined);
  const watch = useShellSessionWatch(toolCallId, watchEnabled);
  const isLive = running || watch.status === "running";
  const canShowDetails = toolCanShowDetails(input, output, errorText, running);
  const view = output ? parseShellToolView(output) : null;
  const description = readShellToolDescription(input);
  const displayTitle = description ?? "终端";
  const useBlockTitle = Boolean(description);
  const commandLine =
    watch.commandLine
    || view?.commandLine
    || "shell";
  const shellKind = watch.shell || view?.shell;
  const meta = isLive
    ? "执行中…"
    : view
      ? formatShellExitMeta(view)
      : errorText
        ? "失败"
        : "完成";
  const failed = Boolean(output && !output.ok);
  const combined = isLive
    ? watch.output
    : (view?.combined ?? watch.output);
  const rawEditorContent = useMemo(() => {
    if (view?.blocked) {
      const reason = view.blockReason ?? "命令已被安全策略拦截";
      return `[blocked] ${reason}`;
    }
    return formatShellDisplayContent(combined, {
      running: isLive,
      commandLine,
      useCommandLine: false,
    });
  }, [view?.blocked, view?.blockReason, commandLine, combined, isLive]);
  const editorContent = useThrottledStreamValue(rawEditorContent, isLive);

  return (
    <>
      <div
        className={`tool-card tool-card--shell tool-card--preview tool-card--with-details${useBlockTitle ? " tool-card--shell-block" : ""}${inBatch ? " tool-card--nested" : ""}${isLive ? " tool-card--running" : ""}${failed ? " tool-card--err" : ""}`}
      >
        {canShowDetails ? (
          <div className="tool-card-actions tool-card-actions--corner">
            <ToolDetailsIconButton onClick={popup.openPopup} />
          </div>
        ) : null}
        {useBlockTitle || isLive || editorContent.trim() ? (
          <TerminalOutputEditor
            content={editorContent}
            commandLine={commandLine}
            shellKind={shellKind}
            running={isLive}
            isError={failed || Boolean(view?.blocked)}
            followTail={isLive}
            variant="inline"
            showHeader={!useBlockTitle}
            title={description ?? undefined}
            titleMeta={useBlockTitle ? meta : undefined}
            titleRunning={useBlockTitle ? isLive : undefined}
            titleError={useBlockTitle ? failed : undefined}
            foldCommandUntilExpand={useBlockTitle}
          />
        ) : null}
        {view?.truncated ? (
          <p className="shell-tool-footnote tool-muted">输出已截断</p>
        ) : null}
        {errorText ? <pre className="tool-error">{errorText}</pre> : null}
      </div>
      <ToolResultPopup
        open={popup.open}
        onClose={popup.closePopup}
        title={displayTitle}
        subtitle={meta}
        toolName="Shell"
        input={input}
        output={output}
        errorText={errorText}
        followTail={isLive}
      />
    </>
  );
}

export const ShellToolRow = memo(ShellToolRowInner);
