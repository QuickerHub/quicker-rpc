import { isStructuredToolResult } from "@/lib/tool-result";
import { summarizeShellRequest } from "@/lib/shell-policy";
import type { ShellKind, ShellRunRequest } from "@/lib/shell-types";

function readShellKind(value: unknown): ShellKind | undefined {
  if (
    value === "auto"
    || value === "powershell"
    || value === "cmd"
    || value === "bash"
  ) {
    return value;
  }
  return undefined;
}

export type ShellToolView = {
  summary: string;
  commandLine: string;
  cwd?: string;
  shell?: string;
  mode?: string;
  exitCode?: number;
  durationMs?: number;
  timedOut?: boolean;
  blocked?: boolean;
  blockReason?: string;
  stdout: string;
  stderr: string;
  combined: string;
  truncated?: boolean;
  ok?: boolean;
};

const INLINE_PREVIEW_MAX_LINES = 48;
const INLINE_PREVIEW_TAIL_LINES = 36;

/** Remove ANSI/VT100 escapes from pwsh/console captures (e.g. Format-Table colors). */
export function stripAnsiEscapes(text: string): string {
  if (!text) return "";
  return text.replace(
    // eslint-disable-next-line no-control-regex
    /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g,
    "",
  );
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

export function shellInputToRunRequest(input: unknown): ShellRunRequest | null {
  const root = readRecord(input);
  if (!root) return null;

  if (typeof root.command === "string" && root.command.trim()) {
    return {
      mode: "command",
      command: root.command.trim(),
      shell: readShellKind(root.shell),
      cwd: typeof root.cwd === "string" ? root.cwd : undefined,
    };
  }
  if (typeof root.script === "string" && root.script.trim()) {
    return {
      mode: "script",
      script: root.script,
      shell: readShellKind(root.shell),
      cwd: typeof root.cwd === "string" ? root.cwd : undefined,
    };
  }
  if (typeof root.scriptPath === "string" && root.scriptPath.trim()) {
    return {
      mode: "scriptPath",
      scriptPath: root.scriptPath.trim(),
      shell: readShellKind(root.shell),
      cwd: typeof root.cwd === "string" ? root.cwd : undefined,
    };
  }
  return null;
}

export function readShellToolDescription(input: unknown): string | null {
  const root = readRecord(input);
  if (!root) return null;
  const value = root.description;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function summarizeShellToolInput(input: unknown): string | null {
  const description = readShellToolDescription(input);
  if (description) return description;
  const request = shellInputToRunRequest(input);
  if (!request) return null;
  return summarizeShellRequest(request);
}

/** Chat card body: output-only when description is set; otherwise full terminal transcript. */
export function formatShellDisplayContent(
  output: string,
  options?: {
    running?: boolean;
    commandLine?: string;
    useCommandLine?: boolean;
  },
): string {
  if (options?.useCommandLine && options.commandLine) {
    return formatShellEditorContent(options.commandLine, output, {
      running: options.running,
    });
  }
  const out = stripAnsiEscapes(output).trimEnd();
  if (options?.running && !out) return "…";
  return out;
}

export function buildShellCombinedOutput(stdout: string, stderr: string): string {
  const out = stripAnsiEscapes(stdout).trimEnd();
  const err = stripAnsiEscapes(stderr).trimEnd();
  if (out && err) return `${out}\n${err}`;
  return out || err;
}

function readShellToolStreams(
  root: Record<string, unknown>,
  outerStderr?: string,
): { stdout: string; stderr: string; combined: string } {
  const unified = stripAnsiEscapes(readString(root, "output")).trimEnd();
  if (unified) {
    return { stdout: unified, stderr: "", combined: unified };
  }

  const legacyCombined = stripAnsiEscapes(readString(root, "combinedOutput"));
  const legacyStdout = stripAnsiEscapes(readString(root, "stdout"));
  const legacyStderr = stripAnsiEscapes(
    readString(root, "stderr") || (outerStderr ?? ""),
  );
  if (legacyCombined && !legacyStdout && !legacyStderr) {
    return { stdout: legacyCombined, stderr: "", combined: legacyCombined };
  }

  const stdout = legacyStdout;
  const stderr = legacyStderr;
  return {
    stdout,
    stderr,
    combined: buildShellCombinedOutput(stdout, stderr),
  };
}

export function parseShellToolView(output: unknown): ShellToolView | null {
  if (!isStructuredToolResult(output)) return null;
  const root = readRecord(output.data);
  if (!root) return null;

  const commandLine =
    readString(root, "commandLine")
    || readString(root, "summary")
    || "shell";
  const streams = readShellToolStreams(root, output.stderr);

  return {
    summary: commandLine,
    commandLine,
    cwd: readString(root, "cwd") || undefined,
    shell: readString(root, "shell") || undefined,
    mode: readString(root, "mode") || undefined,
    exitCode:
      typeof root.exitCode === "number"
        ? root.exitCode
        : output.exitCode,
    durationMs:
      typeof root.durationMs === "number" ? root.durationMs : undefined,
    timedOut: root.timedOut === true,
    blocked: root.blocked === true,
    blockReason: readString(root, "blockReason") || undefined,
    stdout: streams.stdout,
    stderr: streams.stderr,
    combined: streams.combined,
    truncated: root.truncated === true || output.truncated === true,
    ok: output.ok,
  };
}

export function formatShellDuration(durationMs?: number): string | null {
  if (durationMs == null || !Number.isFinite(durationMs)) return null;
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`;
}

export function formatShellExitMeta(view: ShellToolView): string {
  if (view.blocked) {
    return view.blockReason ? `已拦截 · ${view.blockReason}` : "已拦截";
  }
  if (view.timedOut) return "超时";
  if (view.exitCode == null) return view.ok === false ? "失败" : "完成";
  const duration = formatShellDuration(view.durationMs);
  const exit =
    view.exitCode === 0
      ? "exit 0"
      : `exit ${view.exitCode}`;
  return duration ? `${exit} · ${duration}` : exit;
}

/** Last N lines for inline terminal preview (no omission banner). */
export function tailShellOutputForPreview(text: string, tailLines = 4): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  if (lines.length <= tailLines) return text;
  return lines.slice(-tailLines).join("\n");
}

/** Collapse long terminal output for inline chat preview (keep tail). */
export function collapseShellOutputForPreview(
  text: string,
  maxLines = INLINE_PREVIEW_MAX_LINES,
  tailLines = INLINE_PREVIEW_TAIL_LINES,
): { text: string; collapsed: boolean; omittedLines: number } {
  if (!text) {
    return { text: "", collapsed: false, omittedLines: 0 };
  }
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return { text, collapsed: false, omittedLines: 0 };
  }
  const keep = Math.min(tailLines, maxLines);
  const omitted = lines.length - keep;
  const tail = lines.slice(-keep).join("\n");
  return {
    text: `… 省略前 ${omitted} 行 …\n${tail}`,
    collapsed: true,
    omittedLines: omitted,
  };
}

export function countShellOutputLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

/** Single shell card: command line + output in one editor document. */
export function formatShellEditorContent(
  commandLine: string,
  output: string,
  options?: { running?: boolean },
): string {
  const cmd = `$ ${commandLine}`;
  const out = output.trimEnd();
  if (options?.running && !out) return `${cmd}\n…`;
  if (!out) return cmd;
  return `${cmd}\n\n${out}`;
}
