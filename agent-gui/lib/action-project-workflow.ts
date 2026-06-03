import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  findActionProjectDirectory,
  resolveActionProjectDirectory,
} from "@/lib/action-project-path";
import {
  parseActionProjectInfo,
  stripJsonBom,
} from "@/lib/action-project-info-parse";
import {
  formatQkrpcResultForAgent,
  runQkrpcForTool,
  type QkrpcRunResult,
} from "@/lib/qkrpc";
import { resolveWorkspacePath, resolveWorkspaceRoot } from "@/lib/workspace-fs";
import { formatLocalToolResult } from "@/lib/tool-result";
import { buildWorkspaceProjectSummary } from "@/lib/action-project-display";

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
};

export type WorkspaceSyncResult =
  | { ok: true; manifest: ActionProjectManifest }
  | {
      ok: false;
      reason: "no_cwd" | "invalid_id" | "extract_failed" | "manifest_failed";
      error: string;
    };


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
    maxEntries: 300,
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
    return { error: `Project not found at ${dir}.` };
  }

  const infoRaw = stripJsonBom(await readFile(resolvedInfo.absolute, "utf8"));
  const infoParsed = parseActionProjectInfo(infoRaw);
  if (!infoParsed.ok) {
    return { error: infoParsed.error || `Failed to parse ${infoPath}.` };
  }
  if (infoParsed.data.kind !== "action") {
    return { error: `${infoPath} is not an action project.` };
  }

  const id = (infoParsed.data.id ?? actionId).trim();
  if (!isUuid(id)) {
    return { error: `${infoPath} must contain a valid action id.` };
  }

  if (id.toLowerCase() !== actionId.trim().toLowerCase()) {
    return {
      error: `Project info.json id ${id} does not match requested action ${actionId}.`,
    };
  }

  const validateResult = await runQkrpcForTool([
    "action",
    "validate",
    "--dir",
    dir,
  ]);
  const validatePayload = parseQkrpcPayload(validateResult) as ValidatePayload | null;

  const fileRefs =
    validatePayload?.fileRefs?.map((entry) => ({
      stepRef: entry.stepRef,
      paramName: entry.paramName,
      path: entry.relativePath ?? "",
      exists: entry.exists === true,
      sizeBytes: entry.sizeBytes,
    })) ?? [];

  return {
    projectDirectory: dir,
    actionId: id,
    title: infoParsed.data.title,
    editVersion: infoParsed.data.editVersion,
    stepCount: validatePayload?.stepCount,
    variableCount: validatePayload?.variableCount,
    validated: validatePayload?.success === true,
    validationError:
      validatePayload?.success === true
        ? undefined
        : validatePayload?.error
          || (validateResult.ok ? undefined : validateResult.stderr)
          || undefined,
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

  const outline = parseDataJsonOutline(
    await readFile(resolvedData.absolute, "utf8"),
  );
  if ("error" in outline) {
    return { ok: false, error: outline.error };
  }

  const missingFileRefs = manifest.fileRefs.filter((ref) => !ref.exists).length;

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
    },
  };
}

/** Internal: export action from Quicker into .quicker/actions/{name}/ (id in info.json). */
export async function syncActionToWorkspace(
  actionId: string,
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

  const extractResult = await runQkrpcForTool([
    "action",
    "extract",
    "--id",
    id,
  ]);
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

  const manifest = await readActionProjectManifest(id, projectDir);
  if ("error" in manifest) {
    return {
      ok: false,
      reason: "manifest_failed",
      error: manifest.error,
    };
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

  return {
    ...base,
    data: {
      ...root,
      payload: {
        ...payload,
        workspaceSynced: false,
        workspaceSyncError: sync.error,
        workspaceSyncReason: sync.reason,
      },
    },
  };
}

async function syncEditVersionOnDisk(
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

  let projectDir = await resolveActionProjectDirectory(actionId);
  let autoSynced = false;
  if (!projectDir) {
    // Auto bootstrap project on first save so "new action then patch" works.
    const sync = await syncActionToWorkspace(actionId);
    if (!sync.ok) {
      const message = `No .quicker/actions project found for action ${actionId}, and auto-sync failed: ${sync.error}`;
      return formatLocalToolResult(
        { action: "action-save", success: false, errorMessage: message },
        false,
        message,
      );
    }
    projectDir = sync.manifest.projectDirectory;
    autoSynced = true;
  }

  const validateResult = await runQkrpcForTool([
    "action",
    "validate",
    "--dir",
    projectDir,
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
        projectDirectory: projectDir,
        errorMessage: message,
        validation: validatePayload ?? validateResult.parsed,
      },
      false,
      message,
    );
  }

  const applyArgs = ["action", "apply", "--dir", projectDir];
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
    await syncEditVersionOnDisk(projectDir, newVersion);
  }

  const result = formatQkrpcResultForAgent(applyResult);
  if (!autoSynced) {
    return result;
  }

  const data =
    typeof result.data === "object" && result.data !== null
      ? (result.data as Record<string, unknown>)
      : {};
  return {
    ...result,
    data: {
      ...data,
      autoSyncedProject: true,
      projectDirectory: projectDir,
    },
  };
}
