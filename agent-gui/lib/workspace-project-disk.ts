import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  actionProjectInfoPathFromDataPath,
  isActionProjectDataPath,
  programProjectDirFromDataPath,
} from "@/lib/action-project-data-parse";
import { resolveWorkspacePath, resolveWorkspaceRoot } from "@/lib/workspace-fs";

export type WorkspaceProjectDiskResult =
  | { ok: true; projectDirectory: string }
  | {
      ok: false;
      reason: "no_cwd" | "manifest_failed";
      error: string;
    };

/** Minimal program body for a new empty action/subprogram project. */
export function emptyProgramDataJsonContent(): string {
  return `${JSON.stringify({ steps: [], variables: [] }, null, 2)}\n`;
}

/** Create project directory and write info.json (create bootstrap). */
export async function writeWorkspaceProjectInfoJson(
  projectDirRel: string,
  infoContent: string,
): Promise<WorkspaceProjectDiskResult> {
  const cwd = resolveWorkspaceRoot().trim();
  if (!cwd) {
    return {
      ok: false,
      reason: "no_cwd",
      error:
        "Working directory not set — set a workspace folder in the sidebar before creating projects on disk.",
    };
  }

  const projectDir = projectDirRel.trim().replace(/\\/g, "/");
  if (!projectDir) {
    return { ok: false, reason: "manifest_failed", error: "project directory is required." };
  }

  const resolvedDir = resolveWorkspacePath(projectDir);
  if (!resolvedDir.ok) {
    return { ok: false, reason: "manifest_failed", error: resolvedDir.error };
  }

  await mkdir(resolvedDir.absolute, { recursive: true });

  const infoPath = join(projectDir, "info.json");
  const resolvedInfo = resolveWorkspacePath(infoPath);
  if (!resolvedInfo.ok) {
    return { ok: false, reason: "manifest_failed", error: resolvedInfo.error };
  }

  await writeFile(resolvedInfo.absolute, infoContent, "utf8");
  return { ok: true, projectDirectory: projectDir };
}

/** Write empty data.json when missing (new create bootstrap or info-only project). */
export async function writeEmptyProgramDataJsonIfMissing(
  projectDirRel: string,
): Promise<WorkspaceProjectDiskResult> {
  const projectDir = projectDirRel.trim().replace(/\\/g, "/");
  if (!projectDir) {
    return { ok: false, reason: "manifest_failed", error: "project directory is required." };
  }

  const dataPath = join(projectDir, "data.json");
  const resolvedData = resolveWorkspacePath(dataPath);
  if (!resolvedData.ok) {
    return { ok: false, reason: "manifest_failed", error: resolvedData.error };
  }
  if (existsSync(resolvedData.absolute)) {
    return { ok: true, projectDirectory: projectDir };
  }

  const resolvedDir = resolveWorkspacePath(projectDir);
  if (!resolvedDir.ok) {
    return { ok: false, reason: "manifest_failed", error: resolvedDir.error };
  }

  await mkdir(resolvedDir.absolute, { recursive: true });
  await writeFile(resolvedData.absolute, emptyProgramDataJsonContent(), "utf8");
  return { ok: true, projectDirectory: projectDir };
}

/**
 * When opening data.json in the explorer, materialize an empty file if the project
 * already has info.json (e.g. create bootstrap wrote info only).
 */
export async function materializeProgramDataJsonIfNeeded(
  dataJsonPath: string,
): Promise<boolean> {
  const normalized = dataJsonPath.replace(/\\/g, "/");
  if (!isActionProjectDataPath(normalized)) return false;

  const projectDir = programProjectDirFromDataPath(normalized);
  const infoPath = actionProjectInfoPathFromDataPath(normalized);
  if (!projectDir || !infoPath) return false;

  const resolvedData = resolveWorkspacePath(normalized);
  if (!resolvedData.ok) return false;
  if (existsSync(resolvedData.absolute)) return false;

  const resolvedInfo = resolveWorkspacePath(infoPath);
  if (!resolvedInfo.ok || !existsSync(resolvedInfo.absolute)) return false;

  const written = await writeEmptyProgramDataJsonIfMissing(projectDir);
  return written.ok;
}

/** info.json + empty data.json for create bootstrap. */
export async function bootstrapWorkspaceProjectOnCreate(
  projectDirRel: string,
  infoContent: string,
): Promise<WorkspaceProjectDiskResult> {
  const infoWritten = await writeWorkspaceProjectInfoJson(projectDirRel, infoContent);
  if (!infoWritten.ok) return infoWritten;

  const dataWritten = await writeEmptyProgramDataJsonIfMissing(infoWritten.projectDirectory);
  if (!dataWritten.ok) {
    return {
      ok: false,
      reason: dataWritten.reason,
      error: dataWritten.error,
    };
  }

  return { ok: true, projectDirectory: dataWritten.projectDirectory };
}
