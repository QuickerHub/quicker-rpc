import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getActionProjectDataSummary,
  parseDataJsonOutline,
  parseQkrpcPayload,
  programHasBodyFromGetPayload,
  saveActionFromWorkspace,
  syncProjectEditVersionOnDisk,
  type ActionProjectDataSummary,
} from "@/lib/action-project-workflow";
import {
  readCompressedFromGetPayload,
  readEditVersionFromGetPayload,
} from "@/lib/action-project-info-from-get";
import { bootstrapWorkspaceProjectOnCreate } from "@/lib/workspace-project-disk";
import { buildWorkspaceProjectSummary } from "@/lib/action-project-display";
import {
  actionProjectDisplayTitle,
  parseActionProjectInfo,
  stripJsonBom,
} from "@/lib/action-project-info-parse";
import { formatQkrpcResultForAgent, runQkrpcForTool, type QkrpcRunResult } from "@/lib/qkrpc";
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
  exportedUtc?: string;
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
      reason:
        | "no_cwd"
        | "export_failed"
        | "manifest_failed"
        | "empty_program"
        | "invalid_create"
        | "get_failed";
      error: string;
    };

export type SubProgramCreateHints = {
  description?: string;
  icon?: string;
};

/** Build info.json fields from `subprogram get --return-mode metadata`. */
export function subprogramProjectInfoFromMetadataGet(
  subProgramKey: string,
  payload: Record<string, unknown>,
  hints?: SubProgramCreateHints,
): SubProgramProjectInfo {
  const compressed = readCompressedFromGetPayload(payload);
  const id =
    (typeof payload.subProgramId === "string" && payload.subProgramId.trim())
    || (typeof payload.SubProgramId === "string" && payload.SubProgramId.trim())
    || subProgramKey.trim();
  const name = (
    String(payload.name ?? payload.Name ?? "").trim()
    || String(
      compressed?.title
        ?? compressed?.Title
        ?? compressed?.name
        ?? compressed?.Name
        ?? "",
    ).trim()
  );
  const callIdentifier = String(
    payload.callIdentifier ?? payload.CallIdentifier ?? "",
  ).trim();

  return {
    id,
    name: name || undefined,
    description:
      String(
        compressed?.description
          ?? compressed?.Description
          ?? payload.description
          ?? payload.Description
          ?? hints?.description
          ?? "",
      ).trim() || undefined,
    icon:
      String(
        compressed?.icon
          ?? compressed?.Icon
          ?? payload.icon
          ?? payload.Icon
          ?? hints?.icon
          ?? "",
      ).trim() || undefined,
    callIdentifier: callIdentifier || undefined,
    editVersion: readEditVersionFromGetPayload(payload),
    exportedUtc: new Date().toISOString(),
  };
}

/** Fallback info.json fields from `subprogram create` JSON when metadata get is unavailable. */
export function subprogramProjectInfoFromCreateResponse(
  createPayload: Record<string, unknown>,
  hints?: SubProgramCreateHints,
): SubProgramProjectInfo | null {
  const id = String(
    createPayload.subProgramId ?? createPayload.SubProgramId ?? "",
  ).trim();
  if (!id) return null;

  const name = String(createPayload.name ?? createPayload.Name ?? "").trim();
  const callIdentifier = String(
    createPayload.callIdentifier ?? createPayload.CallIdentifier ?? "",
  ).trim();

  return {
    id,
    name: name || undefined,
    description:
      String(
        hints?.description
          ?? createPayload.description
          ?? createPayload.Description
          ?? "",
      ).trim() || undefined,
    icon:
      String(
        hints?.icon ?? createPayload.icon ?? createPayload.Icon ?? "",
      ).trim() || undefined,
    callIdentifier: callIdentifier || undefined,
    editVersion: readEditVersionFromGetPayload(createPayload),
    exportedUtc: new Date().toISOString(),
  };
}

export function formatSubProgramProjectInfo(
  info: SubProgramProjectInfo,
  trailingNewline = true,
): string {
  const record: Record<string, unknown> = {};
  if (info.id?.trim()) record.Id = info.id.trim();
  if (info.name?.trim()) record.Name = info.name.trim();
  if (info.description?.trim()) record.Description = info.description.trim();
  if (info.icon?.trim()) record.Icon = info.icon.trim();
  if (info.callIdentifier?.trim()) {
    record.CallIdentifier = info.callIdentifier.trim();
  }
  if (info.editVersion != null && Number.isFinite(info.editVersion)) {
    record.EditVersion = info.editVersion;
  }
  if (info.exportedUtc?.trim()) record.ExportedUtc = info.exportedUtc.trim();
  return `${JSON.stringify(record, null, 2)}${trailingNewline ? "\n" : ""}`;
}

function parseSubProgramInfo(raw: string): SubProgramProjectInfo | null {
  const parsed = parseActionProjectInfo(raw);
  if (!parsed.ok) return null;
  if (
    parsed.data.kind !== "subprogram"
    && parsed.data.kind !== "embedded-subprogram"
  ) {
    return null;
  }
  const data = parsed.data;
  return {
    id: data.id,
    name: actionProjectDisplayTitle(data),
    description: data.description,
    icon: data.icon,
    callIdentifier: data.callIdentifier,
    editVersion: data.editVersion,
  };
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

/** After create: metadata get → info.json; empty data.json (no full export). */
export async function bootstrapSubprogramProjectForCreate(
  createPayload: Record<string, unknown>,
  hints?: SubProgramCreateHints,
): Promise<SubProgramSyncResult> {
  const createInfo = subprogramProjectInfoFromCreateResponse(createPayload, hints);
  if (!createInfo?.id?.trim()) {
    return {
      ok: false,
      reason: "invalid_create",
      error: "subprogram create response missing subProgramId.",
    };
  }

  const key = createInfo.id;
  let info = createInfo;

  const getResult = await runQkrpcForTool([
    "subprogram",
    "get",
    "--id",
    key,
    "--return-mode",
    "metadata",
  ]);
  if (getResult.ok) {
    const getPayload = parseQkrpcPayload(getResult);
    if (getPayload && getPayload.success !== false) {
      info = subprogramProjectInfoFromMetadataGet(key, getPayload, hints);
    }
  }

  const projectDir = globalSubProgramProjectDir(key);
  const written = await bootstrapWorkspaceProjectOnCreate(
    projectDir,
    formatSubProgramProjectInfo(info),
  );
  if (!written.ok) {
    return {
      ok: false,
      reason: written.reason,
      error: written.error,
    };
  }

  const manifest = await readSubProgramProjectManifest(key);
  if ("error" in manifest) {
    return { ok: false, reason: "manifest_failed", error: manifest.error };
  }

  return { ok: true, manifest };
}

/** Backfill info.json Name/title from Quicker when disk project only has id. */
async function repairSubprogramInfoIfMissingName(
  projectPath: string,
  info: SubProgramProjectInfo | null,
): Promise<SubProgramProjectInfo | null> {
  const key = info?.id?.trim();
  if (!key || info?.name?.trim()) return info;

  const getResult = await runQkrpcForTool([
    "subprogram",
    "get",
    "--id",
    key,
    "--return-mode",
    "metadata",
  ]);
  if (!getResult.ok) return info;

  const getPayload = parseQkrpcPayload(getResult);
  if (!getPayload || getPayload.success === false) return info;

  const enriched = subprogramProjectInfoFromMetadataGet(key, getPayload);
  if (!enriched.name?.trim()) return info;

  const infoResolved = resolveWorkspacePath(`${projectPath}/info.json`);
  if (!infoResolved.ok) return info;

  await writeFile(
    infoResolved.absolute,
    formatSubProgramProjectInfo(enriched),
    "utf8",
  );
  return enriched;
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

  const { augmentToolResultWithPrefixWarnings, guardProjectValuePrefixes } =
    await import("@/lib/program-value-prefix-guard");
  const prefixGuard = await guardProjectValuePrefixes(resolved.absolute, {
    force: options.force,
  });

  const validateResult = await runQkrpcForTool([
    "subprogram",
    "validate",
    "--dir",
    resolved.absolute,
  ]);
  const validatePayload = parseQkrpcPayload(validateResult);
  const validateFailed =
    !validateResult.ok || validatePayload?.success === false;

  if (validateFailed) {
    const message =
      (typeof validatePayload?.error === "string" && validatePayload.error)
      || validateResult.stderr
      || "Workspace subprogram project validation failed.";
    return formatLocalToolResult(
      {
        action: "subprogram-save",
        success: false,
        phase: "validate",
        projectDirectory: projectDirRel,
        projectDirectoryAbsolute: resolved.absolute,
        errorMessage: message,
        validation: validatePayload ?? validateResult.parsed,
      },
      false,
      message,
    );
  }

  const importArgs = ["subprogram", "apply", "--dir", resolved.absolute];
  if (options.force) importArgs.push("--force");

  const importResult = await runQkrpcForTool(importArgs);
  if (!importResult.ok) {
    return formatQkrpcResultForAgent(importResult);
  }

  const importPayload = parseQkrpcPayload(importResult);
  const newVersion =
    typeof importPayload?.editVersion === "number"
      ? importPayload.editVersion
      : undefined;
  if (newVersion != null) {
    await syncProjectEditVersionOnDisk(projectDirRel, newVersion);
  }

  return augmentToolResultWithPrefixWarnings(
    formatQkrpcResultForAgent(importResult),
    prefixGuard.warnings,
  );
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

    info = await repairSubprogramInfoIfMissingName(projectPath, info);

    projects.push({
      dirName,
      path: projectPath,
      subProgramId: info?.id,
      name: info?.name,
      callIdentifier: info?.callIdentifier,
      editVersion: info?.editVersion,
    });
  }

  return {
    ok: true,
    root,
    projects: projects.sort((a, b) =>
      (a.name ?? a.dirName).localeCompare(b.name ?? b.dirName, undefined, {
        sensitivity: "base",
      }),
    ),
  };
}

function stripCompressedBody(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload };
  if ("compressed" in next) {
    const compressed = next.compressed;
    if (typeof compressed === "object" && compressed !== null) {
      const c = compressed as Record<string, unknown>;
      next.compressed = {
        name: c.name ?? c.Name,
        description: c.description ?? c.Description,
        icon: c.icon ?? c.Icon,
      };
    } else {
      delete next.compressed;
    }
  }
  return next;
}

/** Merge subprogram get RPC result with automatic workspace export context. */
export function augmentSubprogramGetWithWorkspace(
  getResult: QkrpcRunResult,
  sync: SubProgramSyncResult,
): Record<string, unknown> {
  const base = formatQkrpcResultForAgent(getResult);
  if (!getResult.ok) return base;

  const root =
    typeof base.data === "object" && base.data !== null
      ? ({ ...(base.data as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? ({ ...(root.payload as Record<string, unknown>) } as Record<string, unknown>)
      : root;

  if (sync.ok) {
    const editing = buildWorkspaceProjectSummary({
      projectDirectory: sync.manifest.projectDirectory,
      title: sync.manifest.name,
      editVersion: sync.manifest.editVersion,
      fileRefs: [],
    });
    const slimPayload = stripCompressedBody(payload);
    const merged = {
      ...root,
      payload: {
        ...slimPayload,
        workspaceSynced: true,
        workspaceProject: editing,
        subProgramId: sync.manifest.subProgramId,
        callIdentifier: sync.manifest.callIdentifier,
      },
    };
    return { ...base, data: merged };
  }

  const skipped = sync.reason === "empty_program";
  return {
    ...base,
    data: {
      ...root,
      payload: {
        ...payload,
        workspaceSynced: false,
        workspaceSyncSkipped: skipped || undefined,
        workspaceSyncError: sync.error,
        workspaceSyncReason: sync.reason,
        ...(skipped
          ? {
              workspaceSyncNote:
                "子程序体为空，未写入 data.json。编辑已有内容后再 get，或新建后直接 write_data / edit_data。",
            }
          : {}),
      },
    },
  };
}

export async function syncSubprogramGetToWorkspace(
  subProgramKey: string,
  getResult: QkrpcRunResult,
): Promise<SubProgramSyncResult> {
  const payload = parseQkrpcPayload(getResult);
  if (!programHasBodyFromGetPayload(payload)) {
    return {
      ok: false,
      reason: "empty_program",
      error:
        "Subprogram has no steps or variables; skipped export to avoid writing an empty data.json.",
    };
  }
  return syncSubprogramToWorkspace(subProgramKey);
}
