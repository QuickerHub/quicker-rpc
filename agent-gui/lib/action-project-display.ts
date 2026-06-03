/** Client-safe workspace project summary parsing (no Node.js imports). */

export type WorkspaceProjectSummary = {
  projectDirectory: string;
  editVersion?: number;
  title?: string;
  stepCount?: number;
  variableCount?: number;
  fileRefCount?: number;
};

export type WorkspaceToolDisplay = {
  actionId?: string;
  title?: string;
  editVersion?: number;
  stepCount?: number;
  variableCount?: number;
  fileRefCount?: number;
  projectDirectory?: string;
  workspaceSynced?: boolean;
  syncError?: string;
};

export type WorkspaceProjectSummaryInput = {
  projectDirectory: string;
  title?: string;
  editVersion?: number;
  stepCount?: number;
  variableCount?: number;
  fileRefs: unknown[];
};

function readToolString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function readToolNumber(
  obj: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

export function buildWorkspaceProjectSummary(
  manifest: WorkspaceProjectSummaryInput,
): WorkspaceProjectSummary {
  const dir = manifest.projectDirectory.replace(/\\/g, "/");
  const fileRefCount = manifest.fileRefs.length;
  return {
    projectDirectory: dir,
    editVersion: manifest.editVersion,
    title: manifest.title,
    stepCount: manifest.stepCount,
    variableCount: manifest.variableCount,
    fileRefCount: fileRefCount > 0 ? fileRefCount : undefined,
  };
}

export function parseWorkspaceToolDisplay(
  data: unknown,
): WorkspaceToolDisplay | null {
  if (typeof data !== "object" || data === null) return null;

  const root = data as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;

  const wpRaw = payload.workspaceProject ?? root.workspaceProject;
  const wp =
    typeof wpRaw === "object" && wpRaw !== null
      ? (wpRaw as Record<string, unknown>)
      : null;

  const workspaceSynced =
    payload.workspaceSynced === true || root.workspaceSynced === true;
  const syncError =
    readToolString(payload, "workspaceSyncError")
    ?? readToolString(root, "workspaceSyncError");

  if (!wp && !workspaceSynced && !syncError) return null;

  const compressed =
    typeof payload.compressed === "object" && payload.compressed !== null
      ? (payload.compressed as Record<string, unknown>)
      : null;

  return {
    actionId:
      readToolString(payload, "actionId", "ActionId")
      ?? readToolString(root, "actionId", "ActionId", "id", "Id"),
    title:
      readToolString(wp ?? {}, "title", "Title")
      ?? readToolString(compressed ?? {}, "title", "Title")
      ?? readToolString(root, "title", "Title"),
    editVersion:
      readToolNumber(wp ?? {}, "editVersion", "EditVersion")
      ?? readToolNumber(payload, "editVersion", "EditVersion")
      ?? readToolNumber(root, "editVersion", "EditVersion"),
    stepCount: readToolNumber(wp ?? {}, "stepCount", "StepCount"),
    variableCount: readToolNumber(wp ?? {}, "variableCount", "VariableCount"),
    fileRefCount: readToolNumber(wp ?? {}, "fileRefCount", "FileRefCount"),
    projectDirectory: readToolString(wp ?? {}, "projectDirectory", "ProjectDirectory"),
    workspaceSynced: workspaceSynced || undefined,
    syncError,
  };
}

export function formatWorkspaceToolMetaLine(display: WorkspaceToolDisplay): string {
  if (display.syncError) {
    return display.title
      ? `${display.title} · 未同步`
      : "未同步到工作区";
  }
  const parts: string[] = [];
  if (display.title) parts.push(display.title);
  if (display.editVersion != null) parts.push(`v${display.editVersion}`);
  if (display.stepCount != null) parts.push(`${display.stepCount} 步`);
  if (parts.length > 0) return parts.join(" · ");
  if (display.projectDirectory) {
    const leaf = display.projectDirectory.split("/").pop();
    return leaf ? `项目 ${leaf.slice(0, 8)}…` : "已同步";
  }
  return "已同步";
}
