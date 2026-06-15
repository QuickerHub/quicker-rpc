import { getRequestCwd } from "@/lib/qkrpc-request-context";
import { invokeQkrpcHttp } from "@/lib/qkrpc-http";
import {
  formatWorkspaceProgramLabel,
  workspaceProgramPrimaryId,
  workspaceProgramProjectDir,
  type WorkspaceProgramTarget,
} from "@/lib/workspace-program-target";
import { resolveWorkspacePath } from "@/lib/workspace-fs";

export type ProgramSyntaxLintScheduleArgs = {
  target: WorkspaceProgramTarget;
  editVersion?: number;
};

/** Fire-and-forget: all syntax checks run in qkrpc serve (plugin RPC). */
export function scheduleProgramSyntaxLint(
  args: ProgramSyntaxLintScheduleArgs,
): void {
  const cwd = getRequestCwd()?.trim();
  if (!cwd) {
    return;
  }

  const projectDirRel = workspaceProgramProjectDir(args.target);
  const resolved = resolveWorkspacePath(projectDirRel);
  if (!resolved.ok) {
    return;
  }

  const targetKind = args.target.kind;
  const id = workspaceProgramPrimaryId(args.target);
  const subProgramId =
    args.target.kind === "embedded_subprogram"
      ? args.target.subProgramId
      : undefined;

  void invokeQkrpcHttp(
    {
      op: "project.lint.schedule",
      args: {
        workspaceRoot: cwd,
        projectDir: resolved.absolute,
        target: targetKind,
        id,
        subProgramId,
        editVersion: args.editVersion,
      },
    },
    { timeoutMs: 15_000 },
  ).catch(() => {
    // best-effort background lint
  });
}

export type ProgramDiagnosticsGetArgs = {
  target: WorkspaceProgramTarget;
  editVersion?: number;
  waitMs?: number;
};

const DEFAULT_DIAGNOSTICS_WAIT_MS = 20_000;

export type ProgramDiagnosticsEvaluation = {
  status: string;
  errorCount: number;
  warningCount: number;
  truncated: number;
  ok: boolean;
  hint?: string;
};

export type ProgramDiagnosticsIssueRow = {
  severity: "error" | "warning";
  code: string;
  kind?: string;
  location?: {
    read?: {
      action?: string;
      path?: string;
      startLine?: number;
      endLine?: number;
      mode?: string;
    };
    dataJsonPath?: string;
    line?: number;
  };
};

function readDiagnosticsIssues(
  payload: Record<string, unknown>,
): ProgramDiagnosticsIssueRow[] {
  const raw = payload.issues;
  if (!Array.isArray(raw)) return [];
  const rows: ProgramDiagnosticsIssueRow[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const code = typeof row.code === "string" ? row.code : "";
    const severity =
      String(row.severity ?? "error").toLowerCase() === "warning"
        ? "warning"
        : "error";
    const location =
      typeof row.location === "object" && row.location !== null
        ? (row.location as ProgramDiagnosticsIssueRow["location"])
        : undefined;
    const kind = typeof row.kind === "string" ? row.kind : undefined;
    rows.push({ severity, code, kind, location });
  }
  return rows;
}

/** Build workspace_program read input from the first compile error (slice when available). */
export function buildDiagnosticsFixReadInput(
  payload: Record<string, unknown>,
  base: {
    target?: string;
    id?: string;
    subProgramId?: string;
  },
): Record<string, unknown> | null {
  const firstError = readDiagnosticsIssues(payload).find(
    (issue) => issue.severity === "error",
  );
  if (!firstError) return null;

  const read = firstError.location?.read;
  const input: Record<string, unknown> = {
    action: "read_data",
    target: base.target,
    id: base.id,
    mode: "content",
  };
  if (base.subProgramId) {
    input.subProgramId = base.subProgramId;
  }

  if (read?.action === "file_read" && read.path) {
    input.action = "file_read";
    input.path = read.path;
    delete input.mode;
  }

  if (typeof read?.startLine === "number" && read.startLine > 0) {
    input.startLine = read.startLine;
  }
  if (typeof read?.endLine === "number" && read.endLine > 0) {
    input.endLine = read.endLine;
  }

  return input;
}

export function evaluateProgramDiagnosticsPayload(
  payload: Record<string, unknown>,
): ProgramDiagnosticsEvaluation {
  const status = String(payload.status ?? "none");
  const summary = payload.summary as Record<string, unknown> | undefined;
  const errorCount =
    typeof summary?.errorCount === "number" ? summary.errorCount : 0;
  const warningCount =
    typeof summary?.warningCount === "number" ? summary.warningCount : 0;
  const truncated =
    typeof summary?.truncated === "number" ? summary.truncated : 0;
  const ok = (status === "ready" && errorCount === 0) || status === "none";

  const issues = readDiagnosticsIssues(payload);
  const hasInterpolationWarnings = issues.some(
    (issue) =>
      issue.severity === "warning"
      && (issue.code === "MISSING_INTERPOLATION_PREFIX"
        || issue.kind === "Interpolation"),
  );

  const hint =
    status === "running"
      ? errorCount > 0 || warningCount > 0
        ? "Fast lint already reported issues below; compile lint still running — fix errors first, then call again with waitMs."
        : "Lint still running; call again with waitMs (recommended 20000) or after a few seconds."
      : status === "stale"
        ? "Diagnostics are stale (data.json changed); patch again to reschedule lint."
        : truncated > 0
          ? `Compile lint capped (${truncated} snippet(s) deferred); fix listed issues and re-run diagnostics.`
          : errorCount > 0
            ? "Fix issues using issues[].locationSummary / location.read, patch, then re-run diagnostics."
            : warningCount > 0 && hasInterpolationWarnings
              ? "Interpolation-prefix warnings are non-blocking — literal {text} may be intentional; add $$/$= only when expansion is intended."
              : warningCount > 0
                ? "Warnings listed below do not block patch; fix only when the issue is real."
                : undefined;

  return { status, errorCount, warningCount, truncated, ok, hint };
}

export async function fetchProgramDiagnostics(
  args: ProgramDiagnosticsGetArgs,
): Promise<Record<string, unknown> | null> {
  const cwd = getRequestCwd()?.trim();
  if (!cwd) {
    return null;
  }

  const projectDirRel = workspaceProgramProjectDir(args.target);
  const resolved = resolveWorkspacePath(projectDirRel);
  if (!resolved.ok) {
    return null;
  }

  const result = await invokeQkrpcHttp(
    {
      op: "project.diagnostics.get",
      args: {
        workspaceRoot: cwd,
        projectDir: resolved.absolute,
        target: args.target.kind,
        id: workspaceProgramPrimaryId(args.target),
        subProgramId:
          args.target.kind === "embedded_subprogram"
            ? args.target.subProgramId
            : undefined,
        editVersion: args.editVersion,
        waitMs: args.waitMs ?? DEFAULT_DIAGNOSTICS_WAIT_MS,
      },
    },
    { timeoutMs: Math.max(30_000, (args.waitMs ?? 0) + 10_000) },
  );

  if (!result?.ok || !result.parsed || typeof result.parsed !== "object") {
    return null;
  }

  return result.parsed as Record<string, unknown>;
}

export function programLabelForLint(target: WorkspaceProgramTarget): string {
  return formatWorkspaceProgramLabel(target);
}
