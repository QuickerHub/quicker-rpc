import { tool } from "ai";
import { z } from "zod";
import { formatLocalToolResult } from "@/lib/tool-result";
import { shellModeLabel, summarizeShellRequest } from "@/lib/shell-policy";
import {
  runShellRequest,
  shellPolicyRequiresApproval,
} from "@/lib/shell-runner";
import {
  DEFAULT_SHELL_TIMEOUT_MS,
  MAX_SHELL_TIMEOUT_MS,
  type ShellRunRequest,
} from "@/lib/shell-types";

export const SHELL_EXEC_TOOL = "shell_exec";

const shellKindSchema = z.enum(["auto", "powershell", "cmd", "bash"]);

const shellInputSchema = z
  .object({
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
        "Inline script body (multi-line OK). Written to a temp file and executed with -File/-lc for reliable quoting.",
      ),
    scriptPath: z
      .string()
      .optional()
      .describe("Relative path to an existing script under the workspace cwd"),
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
      .describe("Working directory relative to workspace, or absolute if it exists"),
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
  const summary = summarizeShellRequest(request);
  return formatLocalToolResult(
    {
      action: "shell-exec",
      success: result.ok,
      summary,
      mode: shellModeLabel(request.mode),
      shell: result.shell,
      cwd: result.cwd,
      commandLine: result.commandLine,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      timedOut: result.timedOut ?? false,
      blocked: result.blocked ?? false,
      blockReason: result.blockReason,
      stdout: result.stdout,
      stderr: result.stderr || undefined,
      truncated: result.truncated,
    },
    result.ok,
    result.ok ? undefined : result.stderr || result.blockReason || "shell command failed",
  );
}

export const SHELL_EXEC_TOOL_DEF = tool({
  description:
    "Run a local shell command or script in the agent working directory. "
    + "Use command for one-liners; script for inline PowerShell/bash; scriptPath for files under cwd. "
    + "Prefer pwsh/build.ps1/qkrpc/dotnet/git/npm in repo tasks. "
    + "Destructive commands (del/rm/git push) may require user confirmation in chat.",
  inputSchema: shellInputSchema,
  execute: async (input: z.infer<typeof shellInputSchema>) => {
    const request = toShellRequest(input);
    const result = await runShellRequest(request);
    return formatShellToolResult(request, result);
  },
  needsApproval: async (input: z.infer<typeof shellInputSchema>) =>
    shellPolicyRequiresApproval(toShellRequest(input)),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needsApproval callback
} as any);
