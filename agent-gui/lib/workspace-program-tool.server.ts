import { tool } from "ai";
import { z } from "zod";
import {
  fetchProgramDiagnostics,
  programLabelForLint,
} from "@/lib/program-syntax-lint";
import { formatLocalToolResult } from "@/lib/tool-result";
import { DEFAULT_READ_CHARS } from "@/lib/workspace-fs";
import { WORKSPACE_PROGRAM_TOOL } from "@/lib/workspace-program-tool";
import { workspaceProgramIdSchema } from "@/lib/workspace-program-schema";
import {
  parseWorkspaceProgramTarget,
  type ParsedWorkspaceProgramInput,
} from "@/lib/workspace-program-target";
import {
  executeWorkspaceProgramEditData,
  executeWorkspaceProgramFileEdit,
  executeWorkspaceProgramFileInfo,
  executeWorkspaceProgramFileRead,
  executeWorkspaceProgramFileSearch,
  executeWorkspaceProgramFileWrite,
  executeWorkspaceProgramPatch,
  executeWorkspaceProgramProjects,
  executeWorkspaceProgramReadData,
  executeWorkspaceProgramWriteData,
} from "@/lib/workspace-program-tools.server";

const workspaceReadSliceSchema = {
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(`UTF-16 char offset (default 0). Prefer startLine for scripts.`),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200_000)
    .optional()
    .describe(`Max chars when using offset (default ${DEFAULT_READ_CHARS}).`),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based start line (preferred for large files)."),
  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based inclusive end line (with startLine)."),
  maxLines: z
    .number()
    .int()
    .min(1)
    .max(2_000)
    .optional()
    .describe("Max lines when using startLine (default 400)."),
};

const actionSchema = z.enum([
  "projects_list",
  "read_data",
  "write_data",
  "edit_data",
  "file_read",
  "file_write",
  "file_edit",
  "file_info",
  "file_search",
  "patch",
  "diagnostics",
]);

export type WorkspaceProgramToolInput = {
  action: z.infer<typeof actionSchema>;
  target?: "action" | "global_subprogram" | "embedded_subprogram" | "all";
  id?: string;
  subProgramId?: string;
  path?: string;
  content?: string;
  mode?: "content" | "summary";
  oldString?: string;
  newString?: string;
  replaceAll?: boolean;
  query?: string;
  maxMatches?: number;
  caseInsensitive?: boolean;
  force?: boolean;
  editVersion?: number;
  waitMs?: number;
  offset?: number;
  limit?: number;
  startLine?: number;
  endLine?: number;
  maxLines?: number;
};

async function executeDiagnostics(
  input: WorkspaceProgramToolInput,
): Promise<Record<string, unknown>> {
  const parsed = parseWorkspaceProgramTarget(input as ParsedWorkspaceProgramInput);
  if (!parsed.ok) {
    return formatLocalToolResult(
      { action: "program-diagnostics", success: false, errorMessage: parsed.error },
      false,
      parsed.error,
    );
  }

  const payload = await fetchProgramDiagnostics({
    target: parsed.target,
    editVersion: input.editVersion,
    waitMs: input.waitMs ?? 0,
  });

  if (!payload) {
    const message =
      "Could not read diagnostics (qkrpc serve unreachable or missing workspace).";
    return formatLocalToolResult(
      { action: "program-diagnostics", success: false, errorMessage: message },
      false,
      message,
    );
  }

  const status = String(payload.status ?? "none");
  const summary = payload.summary as Record<string, unknown> | undefined;
  const errorCount =
    typeof summary?.errorCount === "number" ? summary.errorCount : 0;
  const ok =
    status === "ready" && errorCount === 0
    || status === "none"
    || status === "running";

  const label = programLabelForLint(parsed.target);
  const hint =
    status === "running"
      ? "Lint still running; call again with waitMs or after a few seconds."
      : status === "stale"
        ? "Diagnostics are stale (data.json changed); patch again to reschedule lint."
        : errorCount > 0
          ? "Fix issues using issues[].locationSummary / location.read, patch, then re-run diagnostics."
          : undefined;

  return formatLocalToolResult(
    {
      action: "program-diagnostics",
      success: ok,
      program: label,
      ...payload,
      hint,
    },
    ok,
    errorCount > 0
      ? `${label}: ${errorCount} syntax error(s)`
      : status === "running"
        ? `${label}: lint in progress`
        : undefined,
  );
}

export async function executeWorkspaceProgramTool(
  input: WorkspaceProgramToolInput,
): Promise<Record<string, unknown>> {
  switch (input.action) {
    case "projects_list":
      return executeWorkspaceProgramProjects({
        target: (input.target as "action" | "global_subprogram" | "all" | undefined)
          ?? "all",
      });
    case "read_data":
      return executeWorkspaceProgramReadData(input);
    case "write_data":
      return executeWorkspaceProgramWriteData(input);
    case "edit_data":
      return executeWorkspaceProgramEditData(input);
    case "file_read":
      return executeWorkspaceProgramFileRead(input);
    case "file_write":
      return executeWorkspaceProgramFileWrite(input);
    case "file_edit":
      return executeWorkspaceProgramFileEdit(input);
    case "file_info":
      return executeWorkspaceProgramFileInfo(input);
    case "file_search":
      return executeWorkspaceProgramFileSearch(input);
    case "patch":
      return executeWorkspaceProgramPatch(input);
    case "diagnostics":
      return executeDiagnostics(input);
    default:
      return formatLocalToolResult(
        {
          action: String((input as { action?: string }).action),
          success: false,
          errorMessage: "Unknown workspace_program action",
        },
        false,
        "Unknown workspace_program action",
      );
  }
}

export const WORKSPACE_PROGRAM_TOOL_DEF = tool({
  description:
    "Workspace program editing on disk: projects_list; read/write/edit data.json; file_read/write/edit/info/search under files/; "
    + "patch (save to Quicker); diagnostics (expression/C# lint after patch, use waitMs up to 30000). "
    + "target=action | global_subprogram | embedded_subprogram (subProgramId required). "
    + "After write/edit_data fix valuePrefixWarnings before patch. inputParams keys need qkrpc_step_runner_get.",
  inputSchema: z.object({
    action: actionSchema,
    target: z
      .enum(["action", "global_subprogram", "embedded_subprogram", "all"])
      .optional()
      .describe(
        "action | global_subprogram | embedded_subprogram for program ops; all for projects_list",
      ),
    id: workspaceProgramIdSchema.id.optional(),
    subProgramId: workspaceProgramIdSchema.subProgramId,
    path: z.string().optional(),
    content: z.string().optional(),
    mode: z.enum(["content", "summary"]).optional(),
    oldString: z.string().optional(),
    newString: z.string().optional(),
    replaceAll: z.boolean().optional(),
    query: z.string().optional(),
    maxMatches: z.number().int().min(1).max(50).optional(),
    caseInsensitive: z.boolean().optional(),
    force: z.boolean().optional(),
    editVersion: z.number().int().optional(),
    waitMs: z.number().int().min(0).max(120_000).optional(),
    ...workspaceReadSliceSchema,
  }),
  execute: async (input) => executeWorkspaceProgramTool(input),
});

export { WORKSPACE_PROGRAM_TOOL };
