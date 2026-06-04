export type ShellKind = "auto" | "powershell" | "cmd" | "bash";

export type ShellExecMode = "command" | "script" | "scriptPath";

export type ShellRunRequest = {
  mode: ShellExecMode;
  /** One-liner passed to shell -c / -Command */
  command?: string;
  /** Inline script body (written to a temp file for reliable quoting) */
  script?: string;
  /** Path relative to workspace cwd */
  scriptPath?: string;
  shell?: ShellKind;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  /** Extra argv when running scriptPath (not the script path itself) */
  args?: string[];
};

export type ShellRunResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  shell: Exclude<ShellKind, "auto">;
  cwd: string;
  commandLine: string;
  durationMs: number;
  timedOut?: boolean;
  blocked?: boolean;
  blockReason?: string;
};

export const DEFAULT_SHELL_TIMEOUT_MS = 120_000;
export const MAX_SHELL_TIMEOUT_MS = 600_000;
export const MAX_SHELL_OUTPUT_CHARS = 120_000;
