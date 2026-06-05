import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { actionProjectDirFromName } from "@/lib/action-project-path-shared";
import {
  findActionProjectDirectory,
  resolveActionProjectDirectory,
} from "@/lib/action-project-path";
import {
  parseActionProjectInfo,
  stripJsonBom,
} from "@/lib/action-project-info-parse";
import { resolveActionIdFromProject } from "@/lib/action-project-id";
import {
  formatQkrpcResultForAgent,
  runQkrpcForTool,
  type QkrpcRunResult,
} from "@/lib/qkrpc";
import { resolveWorkspacePath, resolveWorkspaceRoot } from "@/lib/workspace-fs";
import { formatLocalToolResult } from "@/lib/tool-result";
import { buildWorkspaceProjectSummary } from "@/lib/action-project-display";
import {
  actionProjectInfoFromCreateResponse,
  actionProjectInfoFromMetadataGet,
  formatActionProjectInfoProto,
  type ActionProjectCreateHints,
} from "@/lib/action-project-info";
import { bootstrapWorkspaceProjectOnCreate } from "@/lib/workspace-project-disk";

export type {
  WorkspaceProjectSummary,
  WorkspaceToolDisplay,
} from "@/lib/action-project-display";
export {
  buildWorkspaceProjectSummary,
  formatWorkspaceToolMetaLine,
  parseWorkspaceToolDisplay,
} from "@/lib/action-project-display";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ActionProjectFileEntry = {
  path: string;
  kind: "file" | "directory";
  sizeBytes?: number;
};

export type ActionProjectManifest = {
  projectDirectory: string;
  actionId: string;
  title?: string;
  editVersion?: number;
  stepCount?: number;
  variableCount?: number;
  validated?: boolean;
  validationError?: string;
  fileRefs: Array<{
    stepRef?: string;
    paramName?: string;
    path: string;
    exists: boolean;
    sizeBytes?: number;
  }>;
  files: ActionProjectFileEntry[];
  /** Populated after action extract when embedded subprograms were externalized. */
  embeddedSubProgramCount?: number;
};

export type WorkspaceSyncResult =
  | { ok: true; manifest: ActionProjectManifest }
  | {
      ok: false;
      reason:
        | "no_cwd"
        | "invalid_id"
        | "invalid_create"
        | "get_failed"
        | "extract_failed"
        | "manifest_failed"
        | "empty_program";
      error: string;
    };

function countNestedSteps(steps: unknown): number {
  if (!Array.isArray(steps)) return 0;
  let total = 0;
  for (const entry of steps) {
    if (typeof entry !== "object" || entry === null) continue;
    total += 1;
    const step = entry as Record<string, unknown>;
    total += countNestedSteps(step.ifSteps);
    total += countNestedSteps(step.elseSteps);
  }
  return total;
}

function parseCompressedProgramRoot(
  payload: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!payload) return null;
  const embedded = payload.compressed ?? payload.Compressed;
  if (typeof embedded === "string") {
    try {
      const parsed = JSON.parse(embedded) as unknown;
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof embedded === "object" && embedded !== null && !Array.isArray(embedded)) {
    return embedded as Record<string, unknown>;
  }
  const json = payload.compressedJson ?? payload.CompressedJson;
  if (typeof json === "string") {
    try {
      const parsed = JSON.parse(json) as unknown;
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function readSubProgramCountFromPayload(
  payload: Record<string, unknown> | null,
): number {
  if (!payload) return 0;
  const top = payload.subProgramCount ?? payload.SubProgramCount;
  if (typeof top === "number" && top > 0) return top;
  const root = parseCompressedProgramRoot(payload);
  if (!root) return 0;
  const nested = root.subProgramCount ?? root.SubProgramCount;
  if (typeof nested === "number" && nested > 0) return nested;
  const sp = root.subPrograms ?? root.SubPrograms;
  return Array.isArray(sp) ? sp.length : 0;
}

/** True when get payload has steps, variables, or embedded subPrograms (else skip disk extract). */
export function programHasBodyFromGetPayload(
  payload: Record<string, unknown> | null,
): boolean {
  if (readSubProgramCountFromPayload(payload) > 0) {
    return true;
  }
  const root = parseCompressedProgramRoot(payload);
  if (!root) return true;
  const stepCount = countNestedSteps(root.steps);
  const variableCount = Array.isArray(root.variables) ? root.variables.length : 0;
  return stepCount > 0 || variableCount > 0;
}


type ValidatePayload = {
  success?: boolean;
  projectDirectory?: string;
  actionId?: string;
  editVersion?: number;
  stepCount?: number;
  variableCount?: number;
  fileRefs?: Array<{
    stepRef?: string;
    paramName?: string;
    relativePath?: string;
    exists?: boolean;
    sizeBytes?: number;
  }>;
  error?: string;
};

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function parseQkrpcPayload(
  result: QkrpcRunResult,
): Record<string, unknown> | null {
  if (typeof result.parsed !== "object" || result.parsed === null) {
    return null;
  }
  const root = result.parsed as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;
  return payload;
}

function getWorkingDirectory(): string | undefined {
  return resolveWorkspaceRoot().trim() || undefined;
}

async function listProjectFiles(
  projectDir: string,
): Promise<ActionProjectFileEntry[]> {
  const resolved = resolveWorkspacePath(projectDir);
  if (!resolved.ok) return [];

  const { listWorkspaceFiles } = await import("@/lib/workspace-fs");
  const listed = await listWorkspaceFiles(projectDir, {
    recursive: true,
    maxEntries: 2000,
  });
  if (!listed.ok) return [];
  return listed.entries;
}

export async function readActionProjectManifest(
  actionId: string,
  projectDir?: string,
): Promise<ActionProjectManifest | { error: string }> {
  if (!isUuid(actionId)) {
    return { error: "actionId must be a GUID." };
  }

  const dir =
    projectDir?.trim()
    || (await findActionProjectDirectory(actionId))
    || undefined;
  if (!dir) {
    return {
      error: `No .quicker/actions project found for action ${actionId}. Run action get to sync first.`,
    };
  }

  const infoPath = join(dir, "info.json");
  const resolvedInfo = resolveWorkspacePath(infoPath);
  if (!resolvedInfo.ok) return { error: resolvedInfo.error };

  if (!existsSync(resolvedInfo.absolute)) {
    const root = resolveWorkspaceRoot();
    return {
      error: root
        ? `Project not found at ${dir} (expected under workspace ${root}). Re-run qkrpc_action_get after setting the sidebar workspace folder.`
        : `Project not found at ${dir}. Set a workspace folder in the sidebar, then qkrpc_action_get.`,
    };
  }

  const infoRaw = stripJsonBom(await readFile(resolvedInfo.absolute, "utf8"));
  const infoParsed = parseActionProjectInfo(infoRaw);
  if (!infoParsed.ok) {
    return { error: infoParsed.error || `Failed to parse ${infoPath}.` };
  }
  if (infoParsed.data.kind !== "action") {
    return { error: `${infoPath} is not an action project.` };
  }

  const dirName = dir.replace(/\\/g, "/").split("/").filter(Boolean).pop();
  const id = resolveActionIdFromProject(dirName, infoParsed.data) ?? actionId.trim();
  if (!isUuid(id)) {
    return {
      error: `Cannot resolve action id for ${dir} (use a GUID folder name or pass --id).`,
    };
  }

  if (id.toLowerCase() !== actionId.trim().toLowerCase()) {
    return {
      error: `Project action id ${id} does not match requested action ${actionId}.`,
    };
  }

  const dataPath = join(dir, "data.json");
  const resolvedData = resolveWorkspacePath(dataPath);
  const hasDataJson =
    resolvedData.ok && existsSync(resolvedData.absolute);

  let stepCount: number | undefined;
  let variableCount: number | undefined;
  let validated: boolean | undefined;
  let validationError: string | undefined;
  let fileRefs: ActionProjectManifest["fileRefs"] = [];

  if (hasDataJson) {
    const projectResolved = resolveWorkspacePath(dir);
    const validateDir = projectResolved.ok ? projectResolved.absolute : dir;
    const validateResult = await runQkrpcForTool([
      "action",
      "validate",
      "--dir",
      validateDir,
    ]);
    const validatePayload = parseQkrpcPayload(validateResult) as ValidatePayload | null;
    fileRefs =
      validatePayload?.fileRefs?.map((entry) => ({
        stepRef: entry.stepRef,
        paramName: entry.paramName,
        path: entry.relativePath ?? "",
        exists: entry.exists === true,
        sizeBytes: entry.sizeBytes,
      })) ?? [];
    stepCount = validatePayload?.stepCount;
    variableCount = validatePayload?.variableCount;
    validated = validatePayload?.success === true;
    validationError =
      validatePayload?.success === true
        ? undefined
        : validatePayload?.error
          || (validateResult.ok ? undefined : validateResult.stderr)
          || undefined;
  } else {
    stepCount = 0;
    variableCount = 0;
  }

  return {
    projectDirectory: dir,
    actionId: id,
    title: infoParsed.data.title,
    editVersion: infoParsed.data.editVersion,
    stepCount,
    variableCount,
    validated,
    validationError,
    fileRefs,
    files: await listProjectFiles(dir),
  };
}

export type ActionProjectDataSummary = {
  actionId: string;
  projectDirectory: string;
  editVersion?: number;
  stepCount?: number;
  variableCount?: number;
  validated: boolean;
  validationError?: string;
  stepsOutline: Array<{ index: number; stepRunnerKey: string }>;
  variableKeys: string[];
  fileRefCount: number;
  missingFileRefs: number;
  valuePrefixWarningCount?: number;
  valuePrefixWarnings?: import("@/lib/quicker-interpolation-lint").ProgramValuePrefixWarning[];
};

export function parseDataJsonOutline(raw: string): {
  stepsOutline: ActionProjectDataSummary["stepsOutline"];
  variableKeys: string[];
} | { error: string } {
  try {
    const data = JSON.parse(stripJsonBom(raw)) as Record<string, unknown>;
    const steps = Array.isArray(data.steps) ? data.steps : [];
    const variables = Array.isArray(data.variables) ? data.variables : [];
    return {
      stepsOutline: steps.map((step, index) => {
        const row = step as Record<string, unknown>;
        const key =
          typeof row.stepRunnerKey === "string" && row.stepRunnerKey.trim()
            ? row.stepRunnerKey.trim()
            : "?";
        return { index, stepRunnerKey: key };
      }),
      variableKeys: variables
        .map((variable) => {
          const row = variable as Record<string, unknown>;
          return typeof row.key === "string" ? row.key.trim() : "";
        })
        .filter((key) => key.length > 0),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `data.json parse failed: ${message}` };
  }
}

/** Compact project snapshot for verification — no full data.json content. */
export async function getActionProjectDataSummary(
  actionId: string,
): Promise<
  { ok: true; summary: ActionProjectDataSummary } | { ok: false; error: string }
> {
  const manifest = await readActionProjectManifest(actionId);
  if ("error" in manifest) {
    return { ok: false, error: manifest.error };
  }

  const dataPath = join(manifest.projectDirectory, "data.json");
  const resolvedData = resolveWorkspacePath(dataPath);
  if (!resolvedData.ok) {
    return { ok: false, error: resolvedData.error };
  }
  if (!existsSync(resolvedData.absolute)) {
    return { ok: false, error: `data.json not found under ${manifest.projectDirectory}.` };
  }

  const raw = await readFile(resolvedData.absolute, "utf8");
  const outline = parseDataJsonOutline(raw);
  if ("error" in outline) {
    return { ok: false, error: outline.error };
  }

  const missingFileRefs = manifest.fileRefs.filter((ref) => !ref.exists).length;
  const { scanProgramValuePrefixWarnings } = await import(
    "@/lib/quicker-interpolation-lint"
  );
  const valuePrefixWarnings = scanProgramValuePrefixWarnings(raw);

  return {
    ok: true,
    summary: {
      actionId: manifest.actionId,
      projectDirectory: manifest.projectDirectory,
      editVersion: manifest.editVersion,
      stepCount: manifest.stepCount,
      variableCount: manifest.variableCount,
      validated: manifest.validated === true,
      validationError: manifest.validationError,
      stepsOutline: outline.stepsOutline,
      variableKeys: outline.variableKeys,
      fileRefCount: manifest.fileRefs.length,
      missingFileRefs,
      valuePrefixWarningCount: valuePrefixWarnings.length,
      valuePrefixWarnings:
        valuePrefixWarnings.length > 0 ? valuePrefixWarnings.slice(0, 12) : undefined,
    },
  };
}

/** Internal: export action from Quicker into .quicker/actions/{dir}/ (action id = folder name when GUID). */
export async function syncActionToWorkspace(
  actionId: string,
  options?: { projectDirectory?: string },
): Promise<WorkspaceSyncResult> {
  const cwd = getWorkingDirectory();
  if (!cwd) {
    return {
      ok: false,
      reason: "no_cwd",
      error:
        "Working directory not set — action get succeeded but workspace sync was skipped. Set a workspace folder in the sidebar to edit on disk.",
    };
  }

  const id = actionId.trim();
  if (!isUuid(id)) {
    return { ok: false, reason: "invalid_id", error: "actionId must be a GUID." };
  }

  const projectDirRel =
    options?.projectDirectory?.trim() || actionProjectDirFromName(id);
  const resolvedProject = resolveWorkspacePath(projectDirRel);
  if (!resolvedProject.ok) {
    return {
      ok: false,
      reason: "no_cwd",
      error: resolvedProject.error,
    };
  }

  const extractArgs = [
    "action",
    "extract",
    "--id",
    id,
    "--dir",
    resolvedProject.absolute,
  ];
  const extractResult = await runQkrpcForTool(extractArgs);
  if (!extractResult.ok) {
    return {
      ok: false,
      reason: "extract_failed",
      error: extractResult.stderr || "action extract failed",
    };
  }

  const extractPayload = parseQkrpcPayload(extractResult);
  const projectDir =
    typeof extractPayload?.projectDirectory === "string"
      ? extractPayload.projectDirectory
      : await findActionProjectDirectory(id);

  if (!projectDir) {
    return {
      ok: false,
      reason: "manifest_failed",
      error: "Extract succeeded but project directory was not found.",
    };
  }

  const manifest = await readActionProjectManifest(id, projectDirRel);
  if ("error" in manifest) {
    const extractAbs =
      typeof extractPayload?.projectDirectoryAbsolute === "string"
        ? extractPayload.projectDirectoryAbsolute
        : undefined;
    const hint = extractAbs ? ` Extract target was ${extractAbs}.` : "";
    return {
      ok: false,
      reason: "manifest_failed",
      error: `${manifest.error}${hint}`,
    };
  }

  const embeddedDirs = extractPayload?.embeddedSubProgramDirectories;
  const embeddedSubProgramCount = Array.isArray(embeddedDirs)
    ? embeddedDirs.length
    : undefined;

  return {
    ok: true,
    manifest: {
      ...manifest,
      embeddedSubProgramCount,
    },
  };
}

/** After create: mkdir + info.json from create response (no extra get/extract). */
export async function bootstrapActionProjectForCreate(
  createPayload: Record<string, unknown>,
  hints?: ActionProjectCreateHints,
): Promise<WorkspaceSyncResult> {
  const actionId = String(
    createPayload.actionId ?? createPayload.ActionId ?? "",
  ).trim();
  if (!actionId) {
    return {
      ok: false,
      reason: "invalid_create",
      error: "action create response missing actionId.",
    };
  }
  if (!isUuid(actionId)) {
    return { ok: false, reason: "invalid_id", error: "actionId must be a GUID." };
  }

  const projectDir = actionProjectDirFromName(actionId);
  const info = actionProjectInfoFromCreateResponse(createPayload, hints);
  const written = await bootstrapWorkspaceProjectOnCreate(
    projectDir,
    formatActionProjectInfoProto(info),
  );
  if (!written.ok) {
    return {
      ok: false,
      reason: written.reason,
      error: written.error,
    };
  }

  const manifest = await readActionProjectManifest(actionId, projectDir);
  if ("error" in manifest) {
    return { ok: false, reason: "manifest_failed", error: manifest.error };
  }

  return { ok: true, manifest };
}

function stripCompressedBody(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload };
  if ("compressed" in next) {
    const compressed = next.compressed;
    if (typeof compressed === "object" && compressed !== null) {
      const c = compressed as Record<string, unknown>;
      next.compressed = {
        title: c.title,
        description: c.description,
        icon: c.icon,
      };
    } else {
      delete next.compressed;
    }
  }
  return next;
}

/** Merge action get RPC result with automatic workspace sync context. */
export function augmentActionGetWithWorkspace(
  getResult: QkrpcRunResult,
  sync: WorkspaceSyncResult,
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
    const editing = buildWorkspaceProjectSummary(sync.manifest);
    const slimPayload = stripCompressedBody(payload);
    const merged = {
      ...root,
      payload: {
        ...slimPayload,
        workspaceSynced: true,
        workspaceProject: editing,
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
                "程序体为空，未写入 data.json。编辑已有内容后再 get，或新建后用 create 的 actionId 直接 write_data / edit_data。",
            }
          : {}),
      },
    },
  };
}

/** Update info.json editVersion after a successful Quicker save (actions or subprograms). */
export async function syncProjectEditVersionOnDisk(
  projectDir: string,
  editVersion: number,
): Promise<void> {
  const infoPath = join(projectDir, "info.json");
  const resolved = resolveWorkspacePath(infoPath);
  if (!resolved.ok || !existsSync(resolved.absolute)) return;

  try {
    const raw = stripJsonBom(await readFile(resolved.absolute, "utf8"));
    const parsed = parseActionProjectInfo(raw);
    if (!parsed.ok) return;
    const record = JSON.parse(raw) as Record<string, unknown>;
    if ("editVersion" in record) {
      record.editVersion = editVersion;
    } else {
      record.EditVersion = editVersion;
    }
    await writeFile(resolved.absolute, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  } catch {
    /* best-effort */
  }
}

/** Save workspace project to Quicker (validate → compile file refs → replace). */
export async function saveActionFromWorkspace(options: {
  id: string;
  force?: boolean;
}): Promise<Record<string, unknown>> {
  const actionId = options.id.trim();
  if (!isUuid(actionId)) {
    const message = "id must be a GUID.";
    return formatLocalToolResult(
      { action: "action-save", success: false, errorMessage: message },
      false,
      message,
    );
  }

  const cwd = getWorkingDirectory();
  if (!cwd) {
    const message =
      "Working directory not set. Choose a workspace folder in the sidebar.";
    return formatLocalToolResult(
      { action: "action-save", success: false, errorMessage: message },
      false,
      message,
    );
  }

  const projectDirRel = await resolveActionProjectDirectory(actionId);
  if (!projectDirRel) {
    const message = `No .quicker/actions project for action ${actionId}. Create with qkrpc_action_create or sync a non-empty action with qkrpc_action_get, then write data.json before patch.`;
    return formatLocalToolResult(
      { action: "action-save", success: false, errorMessage: message },
      false,
      message,
    );
  }

  const projectResolved = resolveWorkspacePath(projectDirRel);
  if (!projectResolved.ok) {
    return formatLocalToolResult(
      {
        action: "action-save",
        success: false,
        errorMessage: projectResolved.error,
      },
      false,
      projectResolved.error,
    );
  }
  const projectDirAbs = projectResolved.absolute;

  const { guardProjectValuePrefixes } = await import(
    "@/lib/program-value-prefix-guard"
  );
  const prefixGuard = await guardProjectValuePrefixes(projectDirAbs, {
    force: options.force,
  });
  if (!prefixGuard.ok) {
    return formatLocalToolResult(
      {
        action: "action-save",
        success: false,
        phase: "value-prefix",
        projectDirectory: projectDirRel,
        projectDirectoryAbsolute: projectDirAbs,
        valuePrefixWarningCount: prefixGuard.warnings.length,
        valuePrefixWarnings: prefixGuard.warnings.slice(0, 12),
        firstFixRead: prefixGuard.warnings.find((w) => w.read)?.read,
        errorMessage: prefixGuard.message,
      },
      false,
      prefixGuard.message,
    );
  }

  const validateResult = await runQkrpcForTool([
    "action",
    "validate",
    "--dir",
    projectDirAbs,
  ]);
  const validatePayload = parseQkrpcPayload(validateResult);
  const validateFailed =
    !validateResult.ok || validatePayload?.success === false;

  if (validateFailed) {
    const message =
      (typeof validatePayload?.error === "string" && validatePayload.error)
      || validateResult.stderr
      || "Workspace project validation failed.";
    return formatLocalToolResult(
      {
        action: "action-save",
        success: false,
        phase: "validate",
        projectDirectory: projectDirRel,
        projectDirectoryAbsolute: projectDirAbs,
        errorMessage: message,
        validation: validatePayload ?? validateResult.parsed,
      },
      false,
      message,
    );
  }

  const applyArgs = ["action", "apply", "--dir", projectDirAbs];
  if (options.force) applyArgs.push("--force");

  const applyResult = await runQkrpcForTool(applyArgs);
  if (!applyResult.ok) {
    return formatQkrpcResultForAgent(applyResult);
  }

  const applyPayload = parseQkrpcPayload(applyResult);
  const newVersion =
    typeof applyPayload?.editVersion === "number"
      ? applyPayload.editVersion
      : undefined;
  if (newVersion != null) {
    await syncProjectEditVersionOnDisk(projectDirRel, newVersion);
  }

  return formatQkrpcResultForAgent(applyResult);
}
