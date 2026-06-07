import { z } from "zod";
import { tool } from "ai";
import { formatLocalToolResult } from "@/lib/tool-result";
import {
  fetchProgramDiagnostics,
  evaluateProgramDiagnosticsPayload,
  programLabelForLint,
} from "@/lib/program-syntax-lint";
import {
  parseWorkspaceProgramTarget,
  type ParsedWorkspaceProgramInput,
} from "@/lib/workspace-program-target";

export const WORKSPACE_PROGRAM_DIAGNOSTICS_TOOL =
  "workspace_program_diagnostics";

export const workspaceProgramDiagnosticsTool = tool({
  description:
    "Read compile diagnostics for expressions (sys:evalexpression, $=) and C# scripts (sys:csscript) "
    + "after workspace_program_patch. Checks run asynchronously in qkrpc serve; this tool only reads "
    + "the latest .qkrpc/diagnostics.json snapshot. Call when editing is done (use waitMs up to 30000). "
    + "Each issue includes location (stepPath, stepId, paramName, file, line/column, dataJsonPath) and "
    + "locationSummary plus location.read — use workspace_program({ action: \"file_read\", path, startLine, endLine }) for "
    + "file-backed code, or workspace_program({ action: \"read_data\", mode: \"content\" }) and search dataJsonPath for inline values. "
    + "Fix issues, patch again, then re-run.",
  inputSchema: z.object({
    target: z
      .enum(["action", "global_subprogram", "embedded_subprogram"])
      .describe("Program target (same as workspace_program_patch)."),
    id: z.string().describe("Action GUID or subprogram id/name."),
    subProgramId: z
      .string()
      .optional()
      .describe("Required when target=embedded_subprogram."),
    editVersion: z
      .number()
      .int()
      .optional()
      .describe("Expected editVersion from last successful patch (detects stale diagnostics)."),
    waitMs: z
      .number()
      .int()
      .min(0)
      .max(120_000)
      .optional()
      .describe("Wait up to N ms for background lint to finish (default 20000)."),
  }),
  execute: async (input) => {
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
      waitMs: input.waitMs,
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
    const { errorCount, ok, hint } = evaluateProgramDiagnosticsPayload(payload);

    const label = programLabelForLint(parsed.target);

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
    );
  },
});
