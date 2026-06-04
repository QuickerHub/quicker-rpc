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
        waitMs: args.waitMs ?? 0,
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
