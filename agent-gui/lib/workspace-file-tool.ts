import {
  actionProjectDataToolDisplayName,
  isActionProjectDataTool,
  isWorkspaceExplorerFileTool,
} from "@/lib/action-project-data-tools";
import { isStructuredToolResult } from "@/lib/tool-result";

export const WORKSPACE_FILE_TOOLS = new Set([
  "workspace_file_read",
  "workspace_file_write",
  "workspace_file_edit",
]);

export function isWorkspaceFileTool(toolName: string): boolean {
  return WORKSPACE_FILE_TOOLS.has(toolName);
}

export { isWorkspaceExplorerFileTool };

export type FileListEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

export type WorkspaceFileReadPayload = {
  action: "file-read";
  path: string;
  content: string;
  truncated?: boolean;
  totalChars?: number;
};

export type WorkspaceFileWritePayload = {
  action: "file-write";
  path: string;
  bytesWritten: number;
};

export type WorkspaceFileEditPayload = {
  action: "file-edit";
  path: string;
  replacements: number;
};

export type WorkspaceFileListPayload = {
  action: "file-list";
  path: string;
  entries: FileListEntry[];
  truncated?: boolean;
};

export type WorkspaceFilePayload =
  | WorkspaceFileReadPayload
  | WorkspaceFileWritePayload
  | WorkspaceFileEditPayload
  | WorkspaceFileListPayload;

export function getWorkspaceFilePathFromInput(
  toolName: string,
  input: unknown,
): string | null {
  if (typeof input !== "object" || input === null) return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.path === "string" && obj.path.trim()) {
    return obj.path.trim();
  }
  return null;
}

export function basenamePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

/** Relative workspace path for UI (keeps parent segments, not only basename). */
export function formatWorkspacePathLabel(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "") || ".";
  if (normalized === ".") return ".";
  return normalized.replace(/^\.\//, "") || normalized;
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

export function formatCharCount(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k 字符`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k 字符`;
  return `${n} 字符`;
}

export function guessFileLanguage(path: string): string | undefined {
  const base = basenamePath(path);
  const dot = base.lastIndexOf(".");
  if (dot < 0) return undefined;
  const ext = base.slice(dot + 1).toLowerCase();
  const map: Record<string, string> = {
    json: "json",
    cs: "csharp",
    md: "markdown",
    txt: "text",
    js: "javascript",
    ts: "typescript",
    tsx: "tsx",
    jsx: "jsx",
    css: "css",
    html: "html",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    ps1: "powershell",
    sh: "shell",
  };
  return map[ext];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseWorkspaceFileReadPayload(
  data: unknown,
): WorkspaceFileReadPayload | null {
  if (!isRecord(data)) return null;
  if (
    (data.action === "file-read" || data.action === "action-data-read")
    && typeof data.path === "string"
    && typeof data.content === "string"
  ) {
    return {
      action: "file-read",
      path: data.path,
      content: data.content,
      truncated: data.truncated === true,
      totalChars:
        typeof data.totalChars === "number" ? data.totalChars : undefined,
    };
  }
  return null;
}

export function parseWorkspaceFilePayload(
  toolName: string,
  data: unknown,
): WorkspaceFilePayload | null {
  if (!isRecord(data)) return null;

  switch (toolName) {
    case "workspace_file_read": {
      const read = parseWorkspaceFileReadPayload(data);
      if (read) return read;
      break;
    }
    case "workspace_file_write":
      if (
        data.action === "file-write"
        && typeof data.path === "string"
        && typeof data.bytesWritten === "number"
      ) {
        return {
          action: "file-write",
          path: data.path,
          bytesWritten: data.bytesWritten,
        };
      }
      break;
    case "workspace_file_edit":
      if (
        data.action === "file-edit"
        && typeof data.path === "string"
        && typeof data.replacements === "number"
      ) {
        return {
          action: "file-edit",
          path: data.path,
          replacements: data.replacements,
        };
      }
      break;
  }

  const actionDataRead = parseWorkspaceFileReadPayload(data);
  if (actionDataRead) return actionDataRead;

  if (data.action === "action-data-write" && typeof data.path === "string") {
    const bytesWritten =
      typeof data.bytesWritten === "number"
        ? data.bytesWritten
        : typeof data.bytesWritten === "string"
          ? Number(data.bytesWritten)
          : NaN;
    if (!Number.isFinite(bytesWritten)) return null;
    return {
      action: "file-write",
      path: data.path,
      bytesWritten,
    };
  }
  if (
    data.action === "action-data-edit"
    && typeof data.path === "string"
    && typeof data.replacements === "number"
  ) {
    return {
      action: "file-edit",
      path: data.path,
      replacements: data.replacements,
    };
  }

  if (data.action === "file-list" && typeof data.path === "string") {
    const raw = Array.isArray(data.entries) ? data.entries : [];
    const entries: FileListEntry[] = raw
      .filter(isRecord)
      .map((e) => ({
        name: typeof e.name === "string" ? e.name : "",
        path: typeof e.path === "string" ? e.path : "",
        isDirectory: e.isDirectory === true,
      }))
      .filter((e) => e.name && e.path);
    return {
      action: "file-list",
      path: data.path,
      entries,
      truncated: data.truncated === true,
    };
  }

  return null;
}

export function summarizeWorkspaceFileTool(
  toolName: string,
  output: unknown,
  input?: unknown,
): string | null {
  if (!isStructuredToolResult(output)) return null;

  const actionId = readInputActionId(input);
  const inputPath = getWorkspaceFilePathFromInput(toolName, input);
  const pathHint = isActionProjectDataTool(toolName) && actionId
    ? `data.json · ${shortActionId(actionId)}`
    : inputPath
      ? basenamePath(inputPath)
      : null;

  if (!output.ok) {
    const err =
      isRecord(output.data) && typeof output.data.errorMessage === "string"
        ? output.data.errorMessage
        : output.stderr;
    const prefix = pathHint ?? "文件";
    return err ? `${prefix} · ${err.slice(0, 72)}` : `${prefix} · 失败`;
  }

  if (isRecord(output.data) && output.data.action === "action-data-summary") {
    const steps = typeof output.data.stepCount === "number" ? output.data.stepCount : "?";
    const vars =
      typeof output.data.variableCount === "number" ? output.data.variableCount : "?";
    const validated = output.data.validated === true ? " · 已校验" : "";
    return `${pathHint ?? "data.json"} · ${steps} 步 · ${vars} 变量${validated}`;
  }

  const payload = parseWorkspaceFilePayload(toolName, output.data);
  if (!payload) {
    return pathHint ?? null;
  }

  switch (payload.action) {
    case "file-read": {
      const lines = countLines(payload.content);
      const name = basenamePath(payload.path);
      const size =
        payload.totalChars !== undefined
          ? formatCharCount(payload.totalChars)
          : formatCharCount(payload.content.length);
      const trunc = payload.truncated ? " · 已截断" : "";
      return `${name} · ${lines} 行 · ${size}${trunc}`;
    }
    case "file-write":
      return `${basenamePath(payload.path)} · 写入 ${payload.bytesWritten} 字节`;
    case "file-edit":
      return `${basenamePath(payload.path)} · ${payload.replacements} 处替换`;
    case "file-list": {
      const dir =
        payload.path === "." ? "." : formatWorkspacePathLabel(payload.path);
      const trunc = payload.truncated ? " · 已截断" : "";
      return `${dir} · ${payload.entries.length} 项${trunc}`;
    }
  }
}

function readInputActionId(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const id = (input as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

function shortActionId(actionId: string): string {
  if (actionId.length <= 13) return actionId;
  return `${actionId.slice(0, 8)}…`;
}

/** Relative path for action project data.json in tool UI. */
export function formatActionDataJsonPath(actionId: string): string {
  const id = actionId.trim();
  return `.quicker/actions/${id}/data.json`;
}

/** Hide redundant compact header detail (line stat / diff badge is enough). */
export function shouldShowFileSnapshotHeaderDetail(detail: string | null): boolean {
  if (!detail) return false;
  if (detail.includes("字节") || detail.includes("字符")) return false;
  if (/\d+\s*处替换/.test(detail)) return false;
  return true;
}

/** Detail portion of summarizeWorkspaceFileTool after the basename (e.g. "写入 1789 字节"). */
export function splitFileSnapshotHeaderMeta(
  summaryMeta: string | undefined,
  fileName: string,
): { detail: string | null } {
  const meta = summaryMeta?.trim();
  if (!meta || meta === "完成") return { detail: null };
  const prefix = `${fileName} · `;
  if (meta.startsWith(prefix)) {
    const detail = meta.slice(prefix.length).trim();
    return { detail: detail || null };
  }
  return { detail: meta };
}

export function workspaceFileRunningMeta(
  toolName: string,
  input: unknown,
): string | null {
  if (isActionProjectDataTool(toolName)) {
    const id = readInputActionId(input);
    return id ? `${shortActionId(id)} · data.json…` : "data.json…";
  }
  const path = typeof input === "object" && input !== null && "path" in input
    ? (input as { path?: unknown }).path
    : undefined;
  if (typeof path !== "string" || !path.trim()) {
    return null;
  }
  return `${basenamePath(path.trim())}…`;
}

/** Subtitle on file-tool open rows (read/write/edit). */
export function workspaceFileOpenRowSubtitle(
  toolName: string,
  meta: string,
  isRunning: boolean,
  input?: unknown,
): string {
  if (isRunning) {
    return (
      meta
      || workspaceFileRunningMeta(toolName, input)
      || "…"
    );
  }
  if (meta && meta !== "完成") return meta;
  const path = getWorkspaceFilePathFromInput(toolName, input);
  if (!path) return meta;
  return basenamePath(path);
}

export function workspaceFileToolDisplayName(toolName: string): string | null {
  const actionData = actionProjectDataToolDisplayName(toolName);
  if (actionData) return actionData;
  switch (toolName) {
    case "workspace_file_read":
      return "read";
    case "workspace_file_write":
      return "write";
    case "workspace_file_edit":
      return "edit";
    default:
      return null;
  }
}

export function isWorkspaceFileEditorTool(toolName: string): boolean {
  return (
    toolName === "workspace_file_read"
    || toolName === "workspace_file_write"
    || toolName === "workspace_file_edit"
    || toolName === "workspace_action_read_data"
    || toolName === "workspace_action_write_data"
    || toolName === "workspace_action_edit_data"
  );
}

export function isWorkspaceFileReadTool(toolName: string): boolean {
  return (
    toolName === "workspace_file_read"
    || toolName === "workspace_action_read_data"
  );
}

/** All file editor tools may render an inline code block when expanded in chat. */
export function shouldShowFileEditorCodeBlockInChat(toolName: string): boolean {
  return isWorkspaceFileEditorTool(toolName);
}

/** Write/edit inline snapshot in chat. */
export function hasWorkspaceFileEditorPreviewInChat(toolName: string): boolean {
  return isWorkspaceFileEditorTool(toolName) && !isWorkspaceFileReadTool(toolName);
}

/** Write/edit inline file chip in chat (read uses collapsible tool summary row). */
export function hasWorkspaceFileChipInChat(toolName: string): boolean {
  return hasWorkspaceFileEditorPreviewInChat(toolName);
}

/** Read: folded file chip until expand; write/edit show clamped preview by default. */
export function shouldFoldFileSnapshotInChat(toolName: string): boolean {
  return isWorkspaceFileReadTool(toolName);
}

export type WorkspaceFileEditorPreview = {
  path: string;
  content: string;
  diff?: { removed: string; added: string };
  truncated?: boolean;
  totalChars?: number;
  replacements?: number;
};

function readInputString(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function readInputPath(input: unknown): string | undefined {
  const path = readInputString(input, "path");
  return path?.trim() || undefined;
}

/** Chat write snapshot: green add-only diff (no removed block when empty). */
export function buildWritePreviewDiff(
  content: string,
): { removed: string; added: string } | undefined {
  if (!content) return undefined;
  return { removed: "", added: content };
}

/** Build editor preview from tool input/output (works while running if input is available). */
export function getWorkspaceFileEditorPreview(
  toolName: string,
  input: unknown,
  data: unknown,
): WorkspaceFileEditorPreview | null {
  const inputPath = readInputPath(input);

  switch (toolName) {
    case "workspace_file_read": {
      const payload = parseWorkspaceFilePayload(toolName, data);
      if (payload?.action !== "file-read") {
        if (inputPath) {
          return { path: inputPath, content: "" };
        }
        return null;
      }
      return {
        path: payload.path,
        content: payload.content,
        truncated: payload.truncated,
        totalChars: payload.totalChars,
      };
    }
    case "workspace_file_write": {
      const content = readInputString(input, "content");
      const payload = parseWorkspaceFilePayload(toolName, data);
      const path = payload?.action === "file-write"
        ? payload.path
        : inputPath;
      if (!path || content === undefined) return path ? { path, content: "" } : null;
      return {
        path,
        content,
        diff: buildWritePreviewDiff(content),
      };
    }
    case "workspace_file_edit":
    case "workspace_action_edit_data": {
      const oldString = readInputString(input, "oldString");
      const newString = readInputString(input, "newString");
      const payload = parseWorkspaceFilePayload(toolName, data);
      const path = payload?.action === "file-edit"
        ? payload.path
        : inputPath;
      if (!path || !oldString) return path ? { path, content: "" } : null;
      return {
        path,
        content: newString ?? "",
        diff: { removed: oldString, added: newString ?? "" },
        replacements: payload?.action === "file-edit" ? payload.replacements : undefined,
      };
    }
    case "workspace_action_read_data": {
      if (
        isRecord(data)
        && data.action === "action-data-summary"
        && data.success === true
      ) {
        return null;
      }
      const payload = parseWorkspaceFilePayload(toolName, data);
      if (payload?.action === "file-read") {
        return {
          path: payload.path,
          content: payload.content,
          truncated: payload.truncated,
          totalChars: payload.totalChars,
        };
      }
      const id = readInputActionId(input);
      return id
        ? { path: formatActionDataJsonPath(id), content: "" }
        : null;
    }
    case "workspace_action_write_data": {
      const content = readInputString(input, "content");
      const payload = parseWorkspaceFilePayload(toolName, data);
      const path = payload?.action === "file-write" ? payload.path : undefined;
      const id = readInputActionId(input);
      const body = content ?? "";
      if (path) {
        return {
          path,
          content: body,
          diff: buildWritePreviewDiff(body),
        };
      }
      if (!id) return null;
      return {
        path: formatActionDataJsonPath(id),
        content: body,
        diff: buildWritePreviewDiff(body),
      };
    }
    default:
      return null;
  }
}
