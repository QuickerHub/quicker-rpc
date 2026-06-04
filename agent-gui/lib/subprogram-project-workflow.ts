import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getActionProjectDataSummary,
  parseDataJsonOutline,
  saveActionFromWorkspace,
  type ActionProjectDataSummary,
} from "@/lib/action-project-workflow";
import { stripJsonBom } from "@/lib/action-project-info-parse";
import { formatQkrpcResultForAgent, runQkrpcForTool } from "@/lib/qkrpc";
import { formatLocalToolResult } from "@/lib/tool-result";
import { resolveWorkspacePath, resolveWorkspaceRoot } from "@/lib/workspace-fs";
import {
  globalSubProgramProjectDir,
  getGlobalSubProgramsRootRelative,
  type WorkspaceProgramTarget,
  workspaceProgramProjectDir,
} from "@/lib/workspace-program-target";

export type SubProgramProjectInfo = {
  id?: string;
  name?: string;
  description?: string;
  icon?: string;
  callIdentifier?: string;
  editVersion?: number;
};

export type SubProgramProjectManifest = {
  projectDirectory: string;
  subProgramId: string;
  name?: string;
  callIdentifier?: string;
  editVersion?: number;
};

export type SubProgramProjectMeta = {
  dirName: string;
  path: string;
  subProgramId?: string;
  name?: string;
  callIdentifier?: string;
  editVersion?: number;
};

export type ProgramProjectDataSummary = ActionProjectDataSummary & {
  target: WorkspaceProgramTarget["kind"];
  subProgramId?: string;
  parentActionId?: string;
};

export type SubProgramSyncResult =
  | { ok: true; manifest: SubProgramProjectManifest }
  | {
      ok: false;
      reason: "no_cwd" | "export_failed" | "manifest_failed";
      error: string;
    };

function parseSubProgramInfo(raw: string): SubProgramProjectInfo | null {
  try {
    return JSON.parse(stripJsonBom(raw)) as SubProgramProjectInfo;
  } catch {
    return null;
  }
}

export async function readSubProgramProjectManifest(
  subProgramKey: string,
): Promise<SubProgramProjectManifest | { error: string }> {
  const projectDirectory = globalSubProgramProjectDir(subProgramKey);
  const infoResolved = resolveWorkspacePath(`${projectDirectory}/info.json`);
  if (!infoResolved.ok) {
    return { error: infoResolved.error };
  }
  if (!existsSync(infoResolved.absolute)) {
    return {
      error: `No local project for subprogram ${subProgramKey}. Run qkrpc_subprogram_get({ id }) to sync .quicker/subprograms first.`,
    };
  }

  let info: SubProgramProjectInfo | null = null;
  try {
    info = parseSubProgramInfo(await readFile(infoResolved.absolute, "utf8"));
  } catch {
    return { error: `Failed to read info.json under ${projectDirectory}.` };
  }

  const subProgramId = info?.id?.trim() || info?.name?.trim() || subProgramKey.trim();
  return {
    projectDirectory,
    subProgramId,
    name: info?.name,
    callIdentifier: info?.callIdentifier,
    editVersion: info?.editVersion,
  };
}

export async function syncSubprogramToWorkspace(
  subProgramKey: string,
): Promise<SubProgramSyncResult> {
  const cwd = resolveWorkspaceRoot().trim();
  if (!cwd) {
    return {
      ok: false,
      reason: "no_cwd",
      error:
        "Working directory not set. Choose a workspace folder in the sidebar to edit subprograms on disk.",
    };
  }

  const key = subProgramKey.trim();
  if (!key) {
    return { ok: false, reason: "export_failed", error: "subprogram id or name is required." };
  }

  const projectDirRel = globalSubProgramProjectDir(key);
  const resolvedProject = resolveWorkspacePath(projectDirRel);
  if (!resolvedProject.ok) {
    return { ok: false, reason: "no_cwd", error: resolvedProject.error };
  }

  const exportResult = await runQkrpcForTool([
    "subprogram",
    "export",
    "--id",
    key,
    "--dir",
    resolvedProject.absolute,
  ]);
  if (!exportResult.ok) {
    return {
      ok: false,
      reason: "export_failed",
      error: exportResult.stderr || "subprogram export failed",
    };
  }

  const manifest = await readSubProgramProjectManifest(key);
  if ("error" in manifest) {
    return { ok: false, reason: "manifest_failed", error: manifest.error };
  }

  return { ok: true, manifest };
}

async function summarizeProjectDataJson(
  projectDirectory: string,
  editVersion: number | undefined,
  primaryId: string,
): Promise<
  { ok: true; summary: ActionProjectDataSummary } | { ok: false; error: string }
> {
  const dataPath = join(projectDirectory, "data.json");
  const resolvedData = resolveWorkspacePath(dataPath);
  if (!resolvedData.ok) {
    return { ok: false, error: resolvedData.error };
  }
  if (!existsSync(resolvedData.absolute)) {
    return { ok: false, error: `data.json not found under ${projectDirectory}.` };
  }

  const outline = parseDataJsonOutline(await readFile(resolvedData.absolute, "utf8"));
  if ("error" in outline) {
    return { ok: false, error: outline.error };
  }

  return {
    ok: true,
    summary: {
      actionId: primaryId,
      projectDirectory,
      editVersion,
      stepCount: outline.stepsOutline.length,
      variableCount: outline.variableKeys.length,
      validated: true,
      stepsOutline: outline.stepsOutline,
      variableKeys: outline.variableKeys,
      fileRefCount: 0,
      missingFileRefs: 0,
    },
  };
}

export async function getSubprogramProjectDataSummary(
  subProgramKey: string,
): Promise<
  { ok: true; summary: ProgramProjectDataSummary } | { ok: false; error: string }
> {
  const manifest = await readSubProgramProjectManifest(subProgramKey);
  if ("error" in manifest) {
    return { ok: false, error: manifest.error };
  }

  const summarized = await summarizeProjectDataJson(
    manifest.projectDirectory,
    manifest.editVersion,
    manifest.subProgramId,
  );
  if (!summarized.ok) {
    return summarized;
  }

  return {
    ok: true,
    summary: {
      ...summarized.summary,
      target: "global_subprogram",
      subProgramId: manifest.subProgramId,
    },
  };
}

export async function getEmbeddedSubprogramProjectDataSummary(
  actionId: string,
  subProgramId: string,
): Promise<
  { ok: true; summary: ProgramProjectDataSummary } | { ok: false; error: string }
> {
  const projectDirectory = workspaceProgramProjectDir({
    kind: "embedded_subprogram",
    actionId,
    subProgramId,
  });
  const infoResolved = resolveWorkspacePath(`${projectDirectory}/info.json`);
  let editVersion: number | undefined;
  if (infoResolved.ok && existsSync(infoResolved.absolute)) {
    try {
      const info = JSON.parse(stripJsonBom(await readFile(infoResolved.absolute, "utf8"))) as {
        editVersion?: number;
      };
      editVersion = info.editVersion;
    } catch {
      /* ignore */
    }
  }

  const summarized = await summarizeProjectDataJson(
    projectDirectory,
    editVersion,
    subProgramId,
  );
  if (!summarized.ok) {
    return summarized;
  }

  return {
    ok: true,
    summary: {
      ...summarized.summary,
      target: "embedded_subprogram",
      subProgramId,
      parentActionId: actionId,
      actionId,
    },
  };
}

export async function getProgramProjectDataSummary(
  target: WorkspaceProgramTarget,
): Promise<
  { ok: true; summary: ProgramProjectDataSummary } | { ok: false; error: string }
> {
  switch (target.kind) {
    case "action": {
      const result = await getActionProjectDataSummary(target.actionId);
      if (!result.ok) return result;
      return {
        ok: true,
        summary: { ...result.summary, target: "action" },
      };
    }
    case "global_subprogram":
      return getSubprogramProjectDataSummary(target.subProgramKey);
    case "embedded_subprogram":
      return getEmbeddedSubprogramProjectDataSummary(
        target.actionId,
        target.subProgramId,
      );
  }
}

export async function saveSubprogramFromWorkspace(options: {
  id: string;
  force?: boolean;
}): Promise<Record<string, unknown>> {
  const key = options.id.trim();
  if (!key) {
    const message = "id is required.";
    return formatLocalToolResult(
      { action: "subprogram-save", success: false, errorMessage: message },
      false,
      message,
    );
  }

  const cwd = resolveWorkspaceRoot().trim();
  if (!cwd) {
    const message =
      "Working directory not set. Choose a workspace folder in the sidebar.";
    return formatLocalToolResult(
      { action: "subprogram-save", success: false, errorMessage: message },
      false,
      message,
    );
  }

  const manifest = await readSubProgramProjectManifest(key);
  if ("error" in manifest) {
    const sync = await syncSubprogramToWorkspace(key);
    if (!sync.ok) {
      return formatLocalToolResult(
        {
          action: "subprogram-save",
          success: false,
          errorMessage: sync.error,
        },
        false,
        sync.error,
      );
    }
  }

  const projectDirRel = globalSubProgramProjectDir(key);
  const resolved = resolveWorkspacePath(projectDirRel);
  if (!resolved.ok) {
    return formatLocalToolResult(
      {
        action: "subprogram-save",
        success: false,
        errorMessage: resolved.error,
      },
      false,
      resolved.error,
    );
  }

  const importArgs = ["subprogram", "import", "--dir", resolved.absolute];
  if (options.force) importArgs.push("--force");

  const importResult = await runQkrpcForTool(importArgs);
  return formatQkrpcResultForAgent(importResult);
}

export async function saveProgramFromWorkspace(
  target: WorkspaceProgramTarget,
  options?: { force?: boolean },
): Promise<Record<string, unknown>> {
  switch (target.kind) {
    case "action":
      return saveActionFromWorkspace({
        id: target.actionId,
        force: options?.force,
      });
    case "global_subprogram":
      return saveSubprogramFromWorkspace({
        id: target.subProgramKey,
        force: options?.force,
      });
    case "embedded_subprogram":
      return saveActionFromWorkspace({
        id: target.actionId,
        force: options?.force,
      });
  }
}

export async function listWorkspaceSubProgramProjects(): Promise<
  | { ok: true; root: string; projects: SubProgramProjectMeta[] }
  | { ok: false; error: string }
> {
  const root = getGlobalSubProgramsRootRelative();
  const resolved = resolveWorkspacePath(root);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  const { readdir } = await import("node:fs/promises");
  let dirNames: string[] = [];
  try {
    dirNames = await readdir(resolved.absolute, { withFileTypes: true }).then(
      (items) => items.filter((e) => e.isDirectory()).map((e) => e.name),
    );
  } catch {
    return { ok: true, root, projects: [] };
  }

  const projects: SubProgramProjectMeta[] = [];
  for (const dirName of dirNames) {
    const projectPath = globalSubProgramProjectDir(dirName);
    const infoPath = resolveWorkspacePath(`${projectPath}/info.json`);
    if (!infoPath.ok || !existsSync(infoPath.absolute)) continue;

    let info: SubProgramProjectInfo | null = null;
    try {
      info = parseSubProgramInfo(await readFile(infoPath.absolute, "utf8"));
    } catch {
      continue;
    }

    projects.push({
      dirName,
      path: projectPath,
      subProgramId: info?.id,
      name: info?.name,
      callIdentifier: info?.callIdentifier,
      editVersion: info?.editVersion,
    });
  }

  return { ok: true, root, projects };
}
