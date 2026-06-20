import { tool } from "ai";
import { z } from "zod";
import { formatLocalToolResult } from "@/lib/tool-result";
import { formatToolResultForAgent } from "@/lib/tool-result-agent-view";
import { SHELL_TOOL, SHELL_EXEC_TOOL } from "@/lib/shell-tool-constants";
import { summarizeShellRequest } from "@/lib/shell-policy";
import { normalizeShellRunRequest } from "@/lib/shell-request-normalize";
import { buildShellCombinedOutput } from "@/lib/shell-tool-view";
import {
  runShellRequest,
  shellPolicyRequiresApproval,
} from "@/lib/shell-runner";
import { attachShellOutputArtifact } from "@/lib/agent-harness/artifacts/shell-artifact";
import {
  DEFAULT_SHELL_TIMEOUT_MS,
  MAX_SHELL_TIMEOUT_MS,
  type ShellRunRequest,
} from "@/lib/shell-types";

export { SHELL_TOOL, SHELL_EXEC_TOOL };

const shellKindSchema = z.enum(["auto", "powershell", "cmd", "bash"]);

const shellInputSchema = z
  .object({
    description: z
      .string()
      .min(1)
      .describe(
        "Short human-readable label for the chat UI (what this step does). "
        + "Required — do not rely on the raw command alone.",
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
  )
  .refine(
    (value) => Boolean(value.description?.trim()),
    {
      message: "description is required (short UI label for this shell step)",
      path: ["description"],
    },
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

async function formatShellToolResult(
  input: z.infer<typeof shellInputSchema>,
  request: ShellRunRequest,
  result: Awaited<ReturnType<typeof runShellRequest>>,
  options?: { toolCallId?: string },
) {
  const normalized = normalizeShellRunRequest(request);
  const summary = summarizeShellRequest(normalized);
  const output = buildShellCombinedOutput(result.stdout, result.stderr);
  const fullData: Record<string, unknown> = {
    commandLine: result.commandLine || summary,
  };
  if (result.shell) fullData.shell = result.shell;
  if (result.cwd) fullData.cwd = result.cwd;
  if (result.durationMs != null && result.durationMs > 0) {
    fullData.durationMs = result.durationMs;
  }
  if (result.timedOut) fullData.timedOut = true;
  if (result.blocked) {
    fullData.blocked = true;
    if (result.blockReason) fullData.blockReason = result.blockReason;
  }
  if (output) fullData.output = output;
  if (result.truncated) fullData.truncated = true;

  let modelData = fullData;
  const artifact = output
    ? await attachShellOutputArtifact(output, { toolCallId: options?.toolCallId })
    : null;
  if (artifact) {
    modelData = {
      ...fullData,
      output: artifact.tailPreview,
      artifactRef: artifact.artifactRef,
      bytesWritten: artifact.artifactRef.bytesWritten,
      totalOutputChars: artifact.totalOutputChars,
      readHint: artifact.readHint,
      truncated: true,
    };
  }

  const structured = formatLocalToolResult(
    modelData,
    result.ok,
    result.ok ? undefined : result.stderr || result.blockReason || "shell command failed",
  );

  const withDisplay =
    artifact != null
      ? { ...structured, displayData: fullData }
      : structured;

  return formatToolResultForAgent(
    SHELL_TOOL,
    input,
    withDisplay,
  );
}

export const SHELL_TOOL_DEF = tool({
  description:
    "Run shell commands in sidebar workspace cwd. NOT for plain file I/O — use Read/Write/StrReplace. "
    + "NOT for regex/content search across the tree — use Grep. "
    + "NOT for Quicker program bodies (workspace_program). "
    + "NOT for showing git diffs to the user — side panel 已改动 has Diff tabs; avoid git status/diff unless headless need. "
    + "qkrpc and rg (ripgrep) are auto-added to PATH; prefer Grep or qkrpc tools over raw rg in Shell. "
    + "On connectivity_failure tell user — no shell ping/probe/serve/build.ps1 loops. "
    + "Always set description (UI label). command | script | scriptPath under cwd. "
    + "Read-only (dotnet build, tests) auto-runs; workspace-local writes auto-run; remote/destructive need Confirm.",
  inputSchema: shellInputSchema,
  execute: async (
    input: z.infer<typeof shellInputSchema>,
    options?: { toolCallId?: string },
  ) => {
    const request = toShellRequest(input);
    const sessionId = options?.toolCallId?.trim() || undefined;
    const result = await runShellRequest(request, { sessionId });
    return formatShellToolResult(input, request, result, { toolCallId: sessionId });
  },
  needsApproval: async (input: z.infer<typeof shellInputSchema>) =>
    shellPolicyRequiresApproval(toShellRequest(input)),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needsApproval callback
} as any);

/** @deprecated Use SHELL_TOOL_DEF */
export const SHELL_EXEC_TOOL_DEF = SHELL_TOOL_DEF;
