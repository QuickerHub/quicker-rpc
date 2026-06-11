import { tool } from "ai";
import { z } from "zod";
import { formatLocalToolResult } from "@/lib/tool-result";
import { summarizeShellRequest } from "@/lib/shell-policy";
import { normalizeShellRunRequest } from "@/lib/shell-request-normalize";
import { buildShellCombinedOutput } from "@/lib/shell-tool-view";
import {
  runShellRequest,
  shellPolicyRequiresApproval,
} from "@/lib/shell-runner";
import {
  DEFAULT_SHELL_TIMEOUT_MS,
  MAX_SHELL_TIMEOUT_MS,
  type ShellRunRequest,
} from "@/lib/shell-types";

import { SHELL_EXEC_TOOL } from "@/lib/shell-tool-constants";

export { SHELL_EXEC_TOOL };

const shellKindSchema = z.enum(["auto", "powershell", "cmd", "bash"]);

const shellInputSchema = z
  .object({
    description: z
      .string()
      .optional()
      .describe(
        "Short human-readable label for the chat UI (what this step does). "
        + "Required for user-facing clarity — do not rely on the raw command alone.",
      ),
    command: z
      .string()
      .optional()
      .describe(
        "Single shell command line. On Windows default shell is PowerShell; use cmd explicitly if needed.",
      ),
    script: z
      .string()
      .optional()
      .describe(
        "Inline script body (multi-line OK). Materialized under cwd/.local/shell/ and executed with -File/-lc.",
      ),
    scriptPath: z
      .string()
      .optional()
      .describe(
        "Relative path to an existing script under workspace cwd; prefer .local/ for disposable scripts",
      ),
    args: z
      .array(z.string())
      .optional()
      .describe("Extra arguments when using scriptPath (or inline script)"),
    shell: shellKindSchema
      .optional()
      .describe("Shell runtime (default auto: PowerShell on Windows, bash elsewhere)"),
    cwd: z
      .string()
      .optional()
      .describe(
        "Optional subdirectory under the workspace cwd (relative) or absolute path. "
        + "Omit to run in the sidebar workspace directory.",
      ),
    timeoutMs: z
      .number()
      .int()
      .min(1_000)
      .max(MAX_SHELL_TIMEOUT_MS)
      .optional()
      .describe(`Timeout in ms (default ${DEFAULT_SHELL_TIMEOUT_MS})`),
    env: z
      .record(z.string())
      .optional()
      .describe("Extra environment variables merged onto process.env"),
  })
  .refine(
    (value) =>
      Boolean(value.command?.trim())
      || Boolean(value.script?.trim())
      || Boolean(value.scriptPath?.trim()),
    { message: "Provide command, script, or scriptPath" },
  );

function toShellRequest(input: z.infer<typeof shellInputSchema>): ShellRunRequest {
  if (input.command?.trim()) {
    return {
      mode: "command",
      command: input.command.trim(),
      shell: input.shell,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
      env: input.env,
    };
  }
  if (input.script?.trim()) {
    return {
      mode: "script",
      script: input.script,
      shell: input.shell,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
      env: input.env,
      args: input.args,
    };
  }
  return {
    mode: "scriptPath",
    scriptPath: input.scriptPath!.trim(),
    shell: input.shell,
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    env: input.env,
    args: input.args,
  };
}

function formatShellToolResult(
  request: ShellRunRequest,
  result: Awaited<ReturnType<typeof runShellRequest>>,
) {
  const normalized = normalizeShellRunRequest(request);
  const summary = summarizeShellRequest(normalized);
  const output = buildShellCombinedOutput(result.stdout, result.stderr);
  const data: Record<string, unknown> = {
    commandLine: result.commandLine || summary,
  };
  if (result.shell) data.shell = result.shell;
  if (result.cwd) data.cwd = result.cwd;
  if (result.durationMs != null && result.durationMs > 0) {
    data.durationMs = result.durationMs;
  }
  if (result.timedOut) data.timedOut = true;
  if (result.blocked) {
    data.blocked = true;
    if (result.blockReason) data.blockReason = result.blockReason;
  }
  if (output) data.output = output;
  if (result.truncated) data.truncated = true;

  return formatLocalToolResult(
    data,
    result.ok,
    result.ok ? undefined : result.stderr || result.blockReason || "shell command failed",
  );
}

export const SHELL_EXEC_TOOL_DEF = tool({
  description:
    "Run shell commands in sidebar workspace cwd. NOT for plain file I/O — use workspace_file (read/write/edit). "
    + "NOT for Quicker program bodies (workspace_program). "
    + "NOT for showing git diffs to the user — side panel 已改动 has Diff tabs; avoid git status/diff unless headless need. "
    + "qkrpc and rg (ripgrep) are auto-added to PATH; prefer qkrpc tools for Quicker RPC. "
    + "Use rg to search cwd before guessing file paths or symbols (e.g. rg -n pattern --glob '*.ts'); retry with broader pattern if empty. "
    + "On connectivity_failure tell user — no shell ping/probe/serve/build.ps1 loops. "
    + "Always set description (UI label). command | script | scriptPath under cwd. "
    + "Read-only (dotnet build, tests) auto-runs; writes/deletes need Confirm.",
  inputSchema: shellInputSchema,
  execute: async (
    input: z.infer<typeof shellInputSchema>,
    options?: { toolCallId?: string },
  ) => {
    const request = toShellRequest(input);
    const sessionId = options?.toolCallId?.trim() || undefined;
    const result = await runShellRequest(request, { sessionId });
    return formatShellToolResult(request, result);
  },
  needsApproval: async (input: z.infer<typeof shellInputSchema>) =>
    shellPolicyRequiresApproval(toShellRequest(input)),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needsApproval callback
} as any);
