"use client";

import { TerminalOutputEditor } from "@/components/terminal/TerminalOutputEditor";
import { isStructuredToolResult } from "@/lib/tool-result";
import {
  formatShellDisplayContent,
  parseShellToolView,
  readShellToolDescription,
  summarizeShellToolInput,
} from "@/lib/shell-tool-view";
import { ToolPayloadView } from "./tool-output";

type ShellToolPopupBodyProps = {
  input?: unknown;
  output?: unknown;
  errorText?: string;
  followTail?: boolean;
};

export function ShellToolPopupBody({
  input,
  output,
  errorText,
  followTail = false,
}: ShellToolPopupBodyProps) {
  const view =
    output !== undefined ? parseShellToolView(output) : null;
  const description = readShellToolDescription(input);
  const inputSummary = summarizeShellToolInput(input);
  const combined = view?.combined ?? "";
  const commandLine = view?.commandLine || inputSummary || "shell";
  const editorContent = view?.blocked
    ? `[blocked] ${view.blockReason ?? "命令已被拦截"}`
    : formatShellDisplayContent(combined, {
      running: followTail,
      commandLine,
      useCommandLine: false,
    });

  const hasTechDetails = Boolean(
    commandLine
    || view?.cwd
    || view?.shell
    || (view?.exitCode != null && !description),
  );

  return (
    <div className="tool-body tool-body--shell-popup">
      {view?.blocked ? (
        <p className="shell-tool-popup-banner shell-tool-popup-banner--err">
          {view.blockReason ?? "命令已被安全策略拦截"}
        </p>
      ) : null}

      <div className="shell-tool-popup-main">
        <TerminalOutputEditor
          content={editorContent}
          commandLine={commandLine}
          shellKind={view?.shell}
          running={followTail}
          isError={view?.ok === false || Boolean(view?.blocked)}
          variant="popup"
          followTail={followTail}
          expanded
          showHeader={!description && !followTail}
          foldCommandUntilExpand={Boolean(description)}
        />
      </div>

      {hasTechDetails ? (
        <details className="shell-tool-popup-details">
          <summary className="shell-tool-popup-details__summary">
            命令与环境
          </summary>
          <dl className="shell-tool-popup-details__list">
            {commandLine ? (
              <>
                <dt>命令</dt>
                <dd>
                  <code>{commandLine}</code>
                </dd>
              </>
            ) : null}
            {view?.cwd ? (
              <>
                <dt>目录</dt>
                <dd>
                  <code>{view.cwd}</code>
                </dd>
              </>
            ) : null}
            {view?.shell ? (
              <>
                <dt>Shell</dt>
                <dd>{view.shell}</dd>
              </>
            ) : null}
            {view?.exitCode != null && !description ? (
              <>
                <dt>退出码</dt>
                <dd>{view.exitCode}</dd>
              </>
            ) : null}
          </dl>
        </details>
      ) : null}

      {view?.truncated ? (
        <p className="shell-tool-footnote tool-muted">输出已截断</p>
      ) : null}
      {errorText ? <pre className="tool-error">{errorText}</pre> : null}
      {output !== undefined
      && isStructuredToolResult(output)
      && !view ? (
        <ToolPayloadView
          label="原始结果"
          value={output}
          compact
          toolName="shell_exec"
          followTail={followTail}
        />
      ) : null}
    </div>
  );
}
