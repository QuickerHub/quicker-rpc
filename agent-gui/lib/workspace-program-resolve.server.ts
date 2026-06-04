import { existsSync } from "node:fs";
import { enrichActionProjectResolveError, guardWorkspaceActionId } from "@/lib/action-scope";
import { syncActionToWorkspace } from "@/lib/action-project-workflow";
import { getRequestActionScope } from "@/lib/qkrpc-request-context";
import { syncSubprogramToWorkspace } from "@/lib/subprogram-project-workflow";
import { resolveWorkspacePath } from "@/lib/workspace-fs";
import { writeEmptyProgramDataJsonIfMissing } from "@/lib/workspace-project-disk";
import {
  formatWorkspaceProgramLabel,
  parseWorkspaceProgramTarget,
  type ParsedWorkspaceProgramInput,
  type WorkspaceProgramTarget,
  workspaceProgramDataJsonPath,
  workspaceProgramProjectDir,
} from "@/lib/workspace-program-target";

export type ResolvedProgramDataJson = {
  target: WorkspaceProgramTarget;
  projectDir: string;
  path: string;
  primaryId: string;
  parentActionId?: string;
};

export type WorkspaceProgramResolveResult =
  | {
      ok: true;
      resolved: ResolvedProgramDataJson;
      autoSynced?: boolean;
    }
  | { ok: false; error: string };

export type ResolvedProgramProjectFile = {
  target: WorkspaceProgramTarget;
  projectDir: string;
  path: string;
  resourcePath: string;
  primaryId: string;
  parentActionId?: string;
  autoSynced?: boolean;
  scopeKind?: "file" | "directory";
};

export function parseProgramTargetInput(
  input: ParsedWorkspaceProgramInput,
):
  | { ok: true; target: WorkspaceProgramTarget }
  | { ok: false; error: string } {
  return parseWorkspaceProgramTarget(input);
}

async function ensureProgramProjectOnDisk(
  target: WorkspaceProgramTarget,
): Promise<{ ok: true; autoSynced: boolean } | { ok: false; error: string }> {
  const projectDir = workspaceProgramProjectDir(target);
  const dataPath = workspaceProgramDataJsonPath(target);
  const resolved = resolveWorkspacePath(dataPath);
  if (resolved.ok && existsSync(resolved.absolute)) {
    return { ok: true, autoSynced: false };
  }

  const infoResolved = resolveWorkspacePath(`${projectDir}/info.json`);
  if (infoResolved.ok && existsSync(infoResolved.absolute)) {
    const empty = await writeEmptyProgramDataJsonIfMissing(projectDir);
    const dataAfter = resolveWorkspacePath(dataPath);
    if (empty.ok && dataAfter.ok && existsSync(dataAfter.absolute)) {
      return { ok: true, autoSynced: false };
    }
  }

  switch (target.kind) {
    case "action": {
      const scope = getRequestActionScope();
      const guard = guardWorkspaceActionId(target.actionId, scope);
      if (!guard.ok) return { ok: false, error: guard.error };
      const sync = await syncActionToWorkspace(guard.id);
      if (!sync.ok) {
        return {
          ok: false,
          error: enrichActionProjectResolveError(sync.error, scope, guard.id),
        };
      }
      return { ok: true, autoSynced: true };
    }
    case "global_subprogram": {
      const sync = await syncSubprogramToWorkspace(target.subProgramKey);
      if (!sync.ok) {
        return { ok: false, error: sync.error };
      }
      return { ok: true, autoSynced: true };
    }
    case "embedded_subprogram": {
      const scope = getRequestActionScope();
      const guard = guardWorkspaceActionId(target.actionId, scope);
      if (!guard.ok) return { ok: false, error: guard.error };
      const sync = await syncActionToWorkspace(guard.id);
      if (!sync.ok) {
        return {
          ok: false,
          error: enrichActionProjectResolveError(sync.error, scope, guard.id),
        };
      }
      const embeddedData = resolveWorkspacePath(dataPath);
      if (!embeddedData.ok || !existsSync(embeddedData.absolute)) {
        return {
          ok: false,
          error:
            `Embedded subprogram ${target.subProgramId} not found under action ${target.actionId}. `
            + "Ensure qkrpc_action_get extracted subprograms/{id}/.",
        };
      }
      return { ok: true, autoSynced: true };
    }
  }
}

export async function resolveWorkspaceProgramDataForTool(
  input: ParsedWorkspaceProgramInput,
): Promise<WorkspaceProgramResolveResult> {
  const parsed = parseWorkspaceProgramTarget(input);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const target = parsed.target;
  const ensured = await ensureProgramProjectOnDisk(target);
  if (!ensured.ok) {
    return { ok: false, error: ensured.error };
  }

  const projectDir = workspaceProgramProjectDir(target);
  const dataPath = workspaceProgramDataJsonPath(target);
  const resolved = resolveWorkspacePath(dataPath);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }
  if (!existsSync(resolved.absolute)) {
    return {
      ok: false,
      error: `data.json not found for ${formatWorkspaceProgramLabel(target)}.`,
    };
  }

  return {
    ok: true,
    resolved: {
      target,
      projectDir,
      path: dataPath,
      primaryId:
        target.kind === "global_subprogram"
          ? target.subProgramKey
          : target.kind === "embedded_subprogram"
            ? target.subProgramId
            : target.actionId,
      parentActionId:
        target.kind === "embedded_subprogram" ? target.actionId : undefined,
    },
    autoSynced: ensured.autoSynced || undefined,
  };
}

function validateProgramResourceRelativePath(
  inputPath: string,
):
  | { ok: true; normalized: string }
  | { ok: false; error: string } {
  const trimmed = inputPath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!trimmed) {
    return { ok: false, error: "path is required." };
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith(".quicker/")) {
    return { ok: false, error: "path must be project-relative (e.g. files/main.cs)." };
  }
  if (lower === "data.json" || lower === "info.json") {
    return { ok: false, error: "use workspace_action_*_data for data.json." };
  }
  if (lower === "files" || lower === "files/") {
    return { ok: false, error: "path must be a file under files/ (e.g. files/main.cs)." };
  }
  if (!lower.startsWith("files/")) {
    return { ok: false, error: "path must start with files/." };
  }

  const segments = trimmed.split("/").filter(Boolean);
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      return { ok: false, error: "path must not contain . or .. segments." };
    }
  }

  const fileName = segments[segments.length - 1];
  if (!fileName || fileName === "files") {
    return { ok: false, error: "path must include a file name under files/." };
  }

  return { ok: true, normalized: segments.join("/") };
}

function validateProgramFilesScopePath(
  inputPath: string,
):
  | { ok: true; normalized: string; kind: "file" | "directory" }
  | { ok: false; error: string } {
  const trimmed = inputPath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!trimmed) {
    return { ok: true, normalized: "files", kind: "directory" };
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith(".quicker/")) {
    return { ok: false, error: "path must be project-relative (e.g. files/ or files/main.cs)." };
  }
  if (lower === "data.json" || lower === "info.json") {
    return { ok: false, error: "use workspace_action_*_data for data.json." };
  }
  if (!lower.startsWith("files")) {
    return { ok: false, error: "path must be under files/ (e.g. files or files/main.cs)." };
  }

  if (lower === "files" || lower === "files/") {
    return { ok: true, normalized: "files", kind: "directory" };
  }

  const segments = trimmed.split("/").filter(Boolean);
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      return { ok: false, error: "path must not contain . or .. segments." };
    }
  }

  const last = segments[segments.length - 1] ?? "";
  const kind: "file" | "directory" =
    last.includes(".") && last !== "files" ? "file" : "directory";
  return { ok: true, normalized: segments.join("/"), kind };
}

export async function resolveWorkspaceProgramFileForTool(
  input: ParsedWorkspaceProgramInput,
  relativePath: string,
): Promise<
  | { ok: true; resolved: ResolvedProgramProjectFile }
  | { ok: false; error: string }
> {
  const validated = validateProgramResourceRelativePath(relativePath);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const dataResolved = await resolveWorkspaceProgramDataForTool(input);
  if (!dataResolved.ok) {
    return { ok: false, error: dataResolved.error };
  }

  const { target, projectDir } = dataResolved.resolved;
  const workspaceRelative = `${projectDir}/${validated.normalized}`;
  const resolved = resolveWorkspacePath(workspaceRelative);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  return {
    ok: true,
    resolved: {
      target,
      projectDir,
      path: resolved.relative,
      resourcePath: validated.normalized,
      primaryId: dataResolved.resolved.primaryId,
      parentActionId: dataResolved.resolved.parentActionId,
      autoSynced: dataResolved.autoSynced,
    },
  };
}

export async function resolveWorkspaceProgramFilesScopeForTool(
  input: ParsedWorkspaceProgramInput,
  relativePath: string | undefined,
): Promise<
  | { ok: true; resolved: ResolvedProgramProjectFile & { scopeKind: "file" | "directory" } }
  | { ok: false; error: string }
> {
  const validated = validateProgramFilesScopePath(relativePath ?? "files");
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const dataResolved = await resolveWorkspaceProgramDataForTool(input);
  if (!dataResolved.ok) {
    return { ok: false, error: dataResolved.error };
  }

  const { target, projectDir } = dataResolved.resolved;
  const workspaceRelative = `${projectDir}/${validated.normalized}`;
  const resolved = resolveWorkspacePath(workspaceRelative);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  let scopeKind: "file" | "directory" = validated.kind;
  if (existsSync(resolved.absolute)) {
    const { stat } = await import("node:fs/promises");
    const st = await stat(resolved.absolute);
    scopeKind = st.isDirectory() ? "directory" : "file";
  }

  return {
    ok: true,
    resolved: {
      target,
      projectDir,
      path: resolved.relative,
      resourcePath: validated.normalized,
      primaryId: dataResolved.resolved.primaryId,
      parentActionId: dataResolved.resolved.parentActionId,
      autoSynced: dataResolved.autoSynced,
      scopeKind,
    },
  };
}

export function programProjectFileToolSuccess(
  action: "file-read" | "file-write" | "file-edit" | "file-info" | "file-search",
  resolved: ResolvedProgramProjectFile,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    action,
    success: true,
    target: resolved.target.kind,
    path: resolved.path,
    projectDir: resolved.projectDir,
    primaryId: resolved.primaryId,
    ...body,
  };
  if (resolved.parentActionId) {
    payload.parentActionId = resolved.parentActionId;
  }
  if (resolved.autoSynced) {
    payload.synced = true;
  }
  return payload;
}

export function formatProgramAutoSyncedNote(autoSynced?: boolean): string | undefined {
  if (!autoSynced) return undefined;
  return "synced from Quicker (extract/export).";
}
