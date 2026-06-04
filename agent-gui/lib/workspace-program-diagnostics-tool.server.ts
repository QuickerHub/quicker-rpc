import { z } from "zod";
import { tool } from "ai";
import { formatLocalToolResult } from "@/lib/tool-result";
import {
  fetchProgramDiagnostics,
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
    + "Fix reported issues via workspace_action_edit_data / workspace_action_file_edit, then patch again.",
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
      .describe("Wait up to N ms for background lint to finish (default 0)."),
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
            ? "Fix issues at location (step/param/file), patch, then re-run this tool."
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
  },
});
