import { tool } from "ai";
import { z } from "zod";
import {
  buildDiagnosticsFixReadInput,
  fetchProgramDiagnostics,
  evaluateProgramDiagnosticsPayload,
  programLabelForLint,
} from "@/lib/program-syntax-lint";
import { formatLocalToolResult, type ToolFeedback } from "@/lib/tool-result";
import { formatToolResultForAgent } from "@/lib/tool-result-agent-view";
import { DEFAULT_READ_CHARS } from "@/lib/workspace-fs";
import { WORKSPACE_PROGRAM_TOOL } from "@/lib/workspace-program-tool";
import { workspaceProgramIdSchema } from "@/lib/workspace-program-schema";
import {
  parseWorkspaceProgramTarget,
  type ParsedWorkspaceProgramInput,
} from "@/lib/workspace-program-target";
import { coerceProgramDataContent } from "@/lib/program-data-input";
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

const actionSchema = z
  .enum([
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
  ])
  .describe(
    "projects_list: list .quicker projects (target=all). "
    + "read_data|write_data|edit_data: data.json (id required, no path). "
    + "file_read|file_write|file_edit|file_info|file_search: under files/ (path required). "
    + "patch: save disk edits to Quicker (after read/edit). "
    + "diagnostics: post-patch lint snapshot (waitMs optional, ≤30000).",
  );

export type WorkspaceProgramToolInput = {
  action: z.infer<typeof actionSchema>;
  target?: "action" | "global_subprogram" | "embedded_subprogram" | "all";
  id?: string;
  subProgramId?: string;
  path?: string;
  content?: string | Record<string, unknown>;
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

function resolveProgramToolInput(
  input: WorkspaceProgramToolInput,
):
  | { ok: true; parsed: ParsedWorkspaceProgramInput }
  | { ok: false; error: string } {
  if (!input.target || input.target === "all") {
    return {
      ok: false,
      error: "target is required (action | global_subprogram | embedded_subprogram).",
    };
  }
  if (!input.id?.trim()) {
    return { ok: false, error: "id is required." };
  }
  const parsed = parseWorkspaceProgramTarget({
    target: input.target,
    id: input.id.trim(),
    subProgramId: input.subProgramId,
  });
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    parsed: {
      target: input.target,
      id: input.id.trim(),
      subProgramId: input.subProgramId,
    },
  };
}

function programInputError(error: string): Record<string, unknown> {
  return formatLocalToolResult(
    { action: "workspace_program", success: false, errorMessage: error },
    false,
    error,
  );
}

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
  const evaluation = evaluateProgramDiagnosticsPayload(payload);
  const { errorCount, warningCount, truncated, ok, hint } = evaluation;

  const label = programLabelForLint(parsed.target);
  const fixReadInput =
    buildDiagnosticsFixReadInput(payload, {
      target: input.target,
      id: input.id,
      subProgramId: input.subProgramId,
    }) ?? {
      action: "read_data",
      target: input.target,
      id: input.id,
      subProgramId: input.subProgramId,
      mode: "content",
    };

  const feedback: ToolFeedback = ok
    ? warningCount > 0
      ? {
          summary: `${label}: diagnostics passed with ${warningCount} warning(s) (non-blocking).`,
        }
      : { summary: `${label}: diagnostics passed.` }
    : status === "running"
      ? {
          summary: `${label}: diagnostics still running.`,
          retryable: true,
          nextActions: [
            {
              tool: "workspace_program",
              priority: "recommended",
              reason: "Wait for the background lint pass to finish.",
              input: {
                action: "diagnostics",
                target: input.target,
                id: input.id,
                subProgramId: input.subProgramId,
                editVersion: input.editVersion,
                waitMs: 30000,
              },
            },
          ],
        }
      : status === "stale"
        ? {
            summary: `${label}: diagnostics are stale.`,
            retryable: true,
            nextActions: [
              {
                tool: "workspace_program",
                priority: "recommended",
                reason: "Patch again to reschedule diagnostics for the latest edit version.",
                input: {
                  action: "patch",
                  target: input.target,
                  id: input.id,
                  subProgramId: input.subProgramId,
                },
              },
            ],
          }
        : {
            summary: `${label}: diagnostics found ${errorCount} syntax error(s).`,
            nextActions: [
              {
                tool: "workspace_program",
                priority: "required",
                reason:
                  "Open the reported slice (location.read startLine/endLine), fix, patch, then rerun diagnostics.",
                input: fixReadInput,
              },
            ],
          };

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
        : status === "stale"
          ? `${label}: diagnostics stale — patch again to reschedule lint`
          : undefined,
    feedback,
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
    case "read_data": {
      const resolved = resolveProgramToolInput(input);
      if (!resolved.ok) return programInputError(resolved.error);
      return executeWorkspaceProgramReadData({ ...input, ...resolved.parsed });
    }
    case "write_data": {
      const resolved = resolveProgramToolInput(input);
      if (!resolved.ok) return programInputError(resolved.error);
      if (input.content == null) {
        return programInputError("content is required for write_data.");
      }
      const coerced = coerceProgramDataContent(input.content);
      if (!coerced.ok) {
        return programInputError(coerced.error);
      }
      return executeWorkspaceProgramWriteData({
        ...resolved.parsed,
        content: coerced.text,
        contentNormalized: coerced.normalized,
      });
    }
    case "edit_data": {
      const resolved = resolveProgramToolInput(input);
      if (!resolved.ok) return programInputError(resolved.error);
      if (input.oldString == null || input.newString == null) {
        return programInputError("oldString and newString are required for edit_data.");
      }
      return executeWorkspaceProgramEditData({
        ...resolved.parsed,
        oldString: input.oldString,
        newString: input.newString,
        replaceAll: input.replaceAll,
      });
    }
    case "file_read": {
      const resolved = resolveProgramToolInput(input);
      if (!resolved.ok) return programInputError(resolved.error);
      if (!input.path?.trim()) return programInputError("path is required for file_read.");
      return executeWorkspaceProgramFileRead({ ...input, ...resolved.parsed, path: input.path });
    }
    case "file_write": {
      const resolved = resolveProgramToolInput(input);
      if (!resolved.ok) return programInputError(resolved.error);
      if (!input.path?.trim() || input.content == null) {
        return programInputError("path and content are required for file_write.");
      }
      return executeWorkspaceProgramFileWrite({
        ...input,
        ...resolved.parsed,
        path: input.path,
        content: input.content,
      });
    }
    case "file_edit": {
      const resolved = resolveProgramToolInput(input);
      if (!resolved.ok) return programInputError(resolved.error);
      if (!input.path?.trim() || input.oldString == null || input.newString == null) {
        return programInputError("path, oldString, and newString are required for file_edit.");
      }
      return executeWorkspaceProgramFileEdit({
        ...input,
        ...resolved.parsed,
        path: input.path,
        oldString: input.oldString,
        newString: input.newString,
        replaceAll: input.replaceAll,
      });
    }
    case "file_info": {
      const resolved = resolveProgramToolInput(input);
      if (!resolved.ok) return programInputError(resolved.error);
      if (!input.path?.trim()) return programInputError("path is required for file_info.");
      return executeWorkspaceProgramFileInfo({ ...input, ...resolved.parsed, path: input.path });
    }
    case "file_search": {
      const resolved = resolveProgramToolInput(input);
      if (!resolved.ok) return programInputError(resolved.error);
      if (!input.query?.trim()) return programInputError("query is required for file_search.");
      return executeWorkspaceProgramFileSearch({
        ...input,
        ...resolved.parsed,
        query: input.query,
        maxMatches: input.maxMatches,
        caseInsensitive: input.caseInsensitive,
      });
    }
    case "patch": {
      const resolved = resolveProgramToolInput(input);
      if (!resolved.ok) return programInputError(resolved.error);
      return executeWorkspaceProgramPatch({ ...input, ...resolved.parsed, force: input.force });
    }
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
    "Edit Quicker program body on disk (.quicker): data.json + files/ → patch saves to Quicker. "
    + "Side panel 已改动 lists changes — do not dump diffs in chat. "
    + "NOT run (qkrpc_action_run), NOT first sync (qkrpc_action_get/qkrpc_subprogram_get), NOT metadata (qkrpc_action_set_metadata). "
    + "target=action | global_subprogram | embedded_subprogram (subProgramId required). "
    + "Workflow: read_data or file_edit → patch → diagnostics (waitMs≤30000). "
    + "Params per action — see action field describe.",
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
    path: z
      .string()
      .optional()
      .describe("Relative path under files/ for file_* actions"),
    content: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .optional()
      .describe(
        "write_data: data.json {steps,variables} as string or object (object is normalized); "
        + "file_write: file body string",
      ),
    mode: z
      .enum(["content", "summary"])
      .optional()
      .describe("read_data: content (default) or summary"),
    oldString: z.string().optional().describe("edit_data/file_edit: text to find"),
    newString: z.string().optional().describe("edit_data/file_edit: replacement text"),
    replaceAll: z.boolean().optional().describe("edit_data/file_edit: replace all matches"),
    query: z.string().optional().describe("file_search: substring query"),
    maxMatches: z.number().int().min(1).max(50).optional().describe("file_search: max hits"),
    caseInsensitive: z.boolean().optional().describe("file_search: case insensitive"),
    force: z.boolean().optional().describe("patch: ignore editVersion conflict"),
    editVersion: z
      .number()
      .int()
      .optional()
      .describe("patch: expected editVersion from last read/patch"),
    waitMs: z
      .number()
      .int()
      .min(0)
      .max(120_000)
      .optional()
      .describe("diagnostics: wait for lint (default 0, max 30000 recommended)"),
    ...workspaceReadSliceSchema,
  }),
  execute: async (input) =>
    formatToolResultForAgent(
      WORKSPACE_PROGRAM_TOOL,
      input,
      await executeWorkspaceProgramTool(input),
    ),
});

export { WORKSPACE_PROGRAM_TOOL };
