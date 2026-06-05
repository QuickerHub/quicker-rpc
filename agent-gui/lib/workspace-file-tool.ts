import {
  actionProjectDataToolDisplayName,
  isActionProjectDataTool,
  isWorkspaceExplorerFileTool,
} from "@/lib/action-project-data-tools";
import { countLineDiffStats } from "@/lib/file-line-diff";
import {
  fileIconKindToLanguage,
  resolveFileIconKind,
} from "@/lib/file-icon-kind";
import { isStructuredToolResult } from "@/lib/tool-result";
import {
  effectiveWorkspaceToolId,
  isWorkspaceFileTool as isWorkspaceFileToolName,
  LEGACY_WORKSPACE_FILE_TOOLS,
} from "@/lib/workspace-program-tool";

export const WORKSPACE_FILE_TOOLS = LEGACY_WORKSPACE_FILE_TOOLS;

export function isWorkspaceFileTool(toolName: string, input?: unknown): boolean {
  return isWorkspaceFileToolName(toolName, input);
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
  totalLines?: number;
  startLine?: number;
  endLine?: number;
  readHint?: string;
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
  return fileIconKindToLanguage(resolveFileIconKind(basenamePath(path)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const PROGRAM_DATA_READ_ACTIONS = new Set([
  "program-data-read",
  "action-data-read",
]);

const PROGRAM_DATA_SUMMARY_ACTIONS = new Set([
  "program-data-summary",
  "action-data-summary",
]);

function isProgramDataReadAction(action: unknown): boolean {
  return typeof action === "string" && PROGRAM_DATA_READ_ACTIONS.has(action);
}

function isProgramDataSummaryAction(action: unknown): boolean {
  return typeof action === "string" && PROGRAM_DATA_SUMMARY_ACTIONS.has(action);
}

/** read_data / read with mode=summary tool result (outline only, no file body). */
export function isWorkspaceReadDataSummaryResult(data: unknown): boolean {
  return isRecord(data) && isProgramDataSummaryAction(data.action);
}

function readInputReadDataMode(input: unknown): "content" | "summary" | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const mode = (input as Record<string, unknown>).mode;
  return mode === "content" || mode === "summary" ? mode : undefined;
}

export function parseWorkspaceFileReadPayload(
  data: unknown,
): WorkspaceFileReadPayload | null {
  if (!isRecord(data)) return null;
  if (
    (data.action === "file-read" || isProgramDataReadAction(data.action))
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
      totalLines:
        typeof data.totalLines === "number" ? data.totalLines : undefined,
      startLine:
        typeof data.startLine === "number" ? data.startLine : undefined,
      endLine: typeof data.endLine === "number" ? data.endLine : undefined,
      readHint:
        typeof data.readHint === "string" && data.readHint.trim()
          ? data.readHint.trim()
          : undefined,
    };
  }
  return null;
}

function readPositiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : undefined;
}

/** 1-based line range label for read summaries (e.g. L12-28). */
export function formatFileReadLineRangeLabel(
  startLine?: number,
  endLine?: number,
  content?: string,
): string | null {
  const start = readPositiveInt(startLine);
  if (start != null) {
    const endRaw = readPositiveInt(endLine);
    const end = endRaw != null && endRaw >= start ? endRaw : start;
    return start === end ? `L${start}` : `L${start}-${end}`;
  }
  const lines = countLines(content ?? "");
  if (lines <= 0) return null;
  return lines === 1 ? "L1" : `L1-${lines}`;
}

/** Chat/tool-card subtitle for workspace file read results. */
export function formatFileReadSummaryMeta(opts: {
  path: string;
  content: string;
  truncated?: boolean;
  totalChars?: number;
  totalLines?: number;
  startLine?: number;
  endLine?: number;
}): string {
  const name = basenamePath(opts.path);
  const range = formatFileReadLineRangeLabel(
    opts.startLine,
    opts.endLine,
    opts.content,
  );
  if (range) {
    const parts = [range];
    if (opts.truncated) {
      parts.push("截断");
      if (opts.totalLines != null && opts.totalLines > 0) {
        parts.push(`共 ${opts.totalLines} 行`);
      }
    }
    return `${name} · ${parts.join(" · ")}`;
  }
  const size =
    opts.totalChars !== undefined
      ? formatCharCount(opts.totalChars)
      : formatCharCount(opts.content.length);
  const trunc = opts.truncated ? " · 截断" : "";
  return `${name} · ${size}${trunc}`;
}

function readRequestedLineRangeFromInput(
  input: unknown,
): { startLine?: number; endLine?: number } {
  if (typeof input !== "object" || input === null) return {};
  const obj = input as Record<string, unknown>;
  const startLine = readPositiveInt(obj.startLine);
  const endLine = readPositiveInt(obj.endLine);
  return { startLine, endLine };
}

export function parseWorkspaceFilePayload(
  toolName: string,
  data: unknown,
): WorkspaceFilePayload | null {
  if (!isRecord(data)) return null;

  switch (toolName) {
    case "workspace_action_file_read": {
      const read = parseWorkspaceFileReadPayload(data);
      if (read) return read;
      break;
    }
    case "workspace_action_file_write":
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
    case "workspace_action_file_edit":
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

  if (
    (data.action === "action-data-write" || data.action === "program-data-write")
    && typeof data.path === "string"
  ) {
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
    (data.action === "action-data-edit" || data.action === "program-data-edit")
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
  const pathHint = isActionProjectDataTool(toolName, input) && actionId
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

  if (isRecord(output.data) && isProgramDataSummaryAction(output.data.action)) {
    const steps = typeof output.data.stepCount === "number" ? output.data.stepCount : "?";
    const vars =
      typeof output.data.variableCount === "number" ? output.data.variableCount : "?";
    const validated = output.data.validated === true ? " · 已校验" : "";
    return `${steps} 步 · ${vars} 变量${validated}`;
  }

  if (isRecord(output.data)) {
    const data = output.data;
    if (data.action === "file-info" && typeof data.sizeBytes === "number") {
      const lines =
        typeof data.lineCount === "number" ? ` · ${data.lineCount} 行` : "";
      return `${pathHint ?? "file"} · ${data.sizeBytes} B${lines}`;
    }
    if (data.action === "file-search" && Array.isArray(data.matches)) {
      const n = data.matches.length;
      const trunc = data.truncated === true ? " · 已截断" : "";
      return `${pathHint ?? "files"} · ${n} 处匹配${trunc}`;
    }
  }

  const payload = parseWorkspaceFilePayload(toolName, output.data);
  if (!payload) {
    return pathHint ?? null;
  }

  switch (payload.action) {
    case "file-read": {
      return formatFileReadSummaryMeta({
        path: payload.path,
        content: payload.content,
        truncated: payload.truncated,
        totalChars: payload.totalChars,
        totalLines: payload.totalLines,
        startLine: payload.startLine,
        endLine: payload.endLine,
      });
    }
    case "file-write": {
      const data = output.data;
      if (isRecord(data)) {
        const diffSuffix = formatFileDiffSummaryFromToolData(data, input);
        if (diffSuffix) {
          return `${basenamePath(payload.path)} · ${diffSuffix}`;
        }
      }
      return `${basenamePath(payload.path)} · 写入 ${payload.bytesWritten} 字节`;
    }
    case "file-edit": {
      const data = output.data;
      if (isRecord(data)) {
        const diffSuffix = formatFileDiffSummaryFromToolData(data, input);
        if (diffSuffix) {
          return `${basenamePath(payload.path)} · ${diffSuffix}`;
        }
      }
      return `${basenamePath(payload.path)} · ${payload.replacements} 处替换`;
    }
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

/** Compact text preview for read_data mode=summary (chat code block). */
export function formatProgramDataSummaryPreview(
  data: Record<string, unknown>,
): string {
  const stepCount =
    typeof data.stepCount === "number" ? data.stepCount : "?";
  const variableCount =
    typeof data.variableCount === "number" ? data.variableCount : "?";
  const lines: string[] = [
    `steps: ${stepCount}, variables: ${variableCount}`,
  ];
  if (data.validated === false && typeof data.validationError === "string") {
    lines.push(`validation: ${data.validationError.trim()}`);
  } else if (data.validated === true) {
    lines.push("validation: ok");
  }
  const outline = Array.isArray(data.stepsOutline) ? data.stepsOutline : [];
  for (const row of outline.slice(0, 48)) {
    if (!isRecord(row)) continue;
    const index = typeof row.index === "number" ? row.index : "?";
    const key =
      typeof row.stepRunnerKey === "string" && row.stepRunnerKey.trim()
        ? row.stepRunnerKey.trim()
        : "?";
    lines.push(`  [${index}] ${key}`);
  }
  if (outline.length > 48) {
    lines.push(`  … +${outline.length - 48} more steps`);
  }
  const variableKeys = Array.isArray(data.variableKeys)
    ? data.variableKeys.filter(
        (k): k is string => typeof k === "string" && k.trim().length > 0,
      )
    : [];
  if (variableKeys.length > 0) {
    const shown = variableKeys.slice(0, 24).join(", ");
    const more =
      variableKeys.length > 24 ? ` … +${variableKeys.length - 24}` : "";
    lines.push(`variables: ${shown}${more}`);
  }
  const prefixWarnings =
    typeof data.valuePrefixWarningCount === "number"
      && data.valuePrefixWarningCount > 0
      ? data.valuePrefixWarningCount
      : 0;
  if (prefixWarnings > 0) {
    lines.push(`valuePrefixWarnings: ${prefixWarnings}`);
  }
  return lines.join("\n");
}

function readToolResultContent(
  data: Record<string, unknown>,
  input?: unknown,
): string {
  if (typeof data.content === "string") return data.content;
  if (typeof input === "object" && input !== null) {
    const content = (input as Record<string, unknown>).content;
    if (typeof content === "string") return content;
    const newString = (input as Record<string, unknown>).newString;
    if (typeof newString === "string") return newString;
  }
  return "";
}

/** +N -M from line diff of tool snapshots (matches FileEditorCard). */
export function formatFileDiffSummaryFromToolData(
  data: Record<string, unknown>,
  input?: unknown,
): string | null {
  if (typeof data.previousContent !== "string" || data.previousContent.length === 0) {
    return null;
  }
  const nextContent = readToolResultContent(data, input);
  const { addLines, removeLines: remLines } = countLineDiffStats(
    data.previousContent,
    nextContent,
  );
  if (addLines === 0 && remLines === 0) return null;
  return `+${addLines} -${remLines}`;
}

/** Hide redundant compact header detail (line stat / diff badge is enough). */
export function shouldShowFileSnapshotHeaderDetail(detail: string | null): boolean {
  if (!detail) return false;
  if (detail.includes("字节") || detail.includes("字符")) return false;
  if (/\d+\s*处替换/.test(detail)) return false;
  if (/^\+\d+\s*-\d+$/.test(detail.trim())) return false;
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
  const { startLine, endLine } = readRequestedLineRangeFromInput(input);
  const range = formatFileReadLineRangeLabel(startLine, endLine);

  if (isActionProjectDataTool(toolName, input)) {
    const id = readInputActionId(input);
    if (range) {
      return id ? `${shortActionId(id)} · data.json · ${range}…` : `data.json · ${range}…`;
    }
    return id ? `${shortActionId(id)} · data.json…` : "data.json…";
  }
  const path = typeof input === "object" && input !== null && "path" in input
    ? (input as { path?: unknown }).path
    : undefined;
  if (typeof path === "string" && path.trim()) {
    const name = basenamePath(path.trim());
    if (range) {
      return `${name} · ${range}…`;
    }
    return `${name}…`;
  }
  return null;
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

export function workspaceFileToolDisplayName(
  toolName: string,
  input?: unknown,
): string | null {
  const actionData = actionProjectDataToolDisplayName(toolName, input);
  if (actionData) return actionData;
  const effective = input !== undefined
    ? effectiveWorkspaceToolId(toolName, input)
    : toolName;
  switch (effective) {
    case "workspace_action_file_read":
      return "read";
    case "workspace_action_file_write":
      return "write";
    case "workspace_action_file_edit":
      return "edit";
    case "workspace_action_file_info":
      return "info";
    case "workspace_action_file_search":
      return "search";
    default:
      return null;
  }
}

export function isWorkspaceFileEditorTool(
  toolName: string,
  input?: unknown,
): boolean {
  const effective = input !== undefined
    ? effectiveWorkspaceToolId(toolName, input)
    : toolName;
  return (
    effective === "workspace_action_file_read"
    || effective === "workspace_action_file_write"
    || effective === "workspace_action_file_edit"
    || effective === "workspace_action_read_data"
    || effective === "workspace_action_write_data"
    || effective === "workspace_action_edit_data"
  );
}

export function isWorkspaceFileReadTool(
  toolName: string,
  input?: unknown,
): boolean {
  const effective = input !== undefined
    ? effectiveWorkspaceToolId(toolName, input)
    : toolName;
  return (
    effective === "workspace_action_file_read"
    || effective === "workspace_action_read_data"
  );
}

/** All file editor tools may render an inline code block when expanded in chat. */
export function shouldShowFileEditorCodeBlockInChat(
  toolName: string,
  input?: unknown,
): boolean {
  return isWorkspaceFileEditorTool(toolName, input);
}

/** Write/edit inline snapshot in chat. */
export function hasWorkspaceFileEditorPreviewInChat(
  toolName: string,
  input?: unknown,
): boolean {
  return (
    isWorkspaceFileEditorTool(toolName, input)
    && !isWorkspaceFileReadTool(toolName, input)
  );
}

/** Write/edit inline file chip in chat (read uses collapsible tool summary row). */
export function hasWorkspaceFileChipInChat(
  toolName: string,
  input?: unknown,
): boolean {
  return hasWorkspaceFileEditorPreviewInChat(toolName, input);
}

/** Read: folded file chip until expand; write/edit show clamped preview by default. */
export function shouldFoldFileSnapshotInChat(
  toolName: string,
  input?: unknown,
): boolean {
  return isWorkspaceFileReadTool(toolName, input);
}

export type WorkspaceFileEditorPreview = {
  path: string;
  content: string;
  diff?: { removed: string; added: string };
  truncated?: boolean;
  /** Pre-write snapshot was truncated (diff may be incomplete). */
  previousSnapshotTruncated?: boolean;
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

function readToolDataString(
  data: unknown,
  key: string,
): string | undefined {
  if (!isRecord(data)) return undefined;
  const value = data[key];
  return typeof value === "string" ? value : undefined;
}

/** Diff for full-file write when a pre-write snapshot is available. */
export function buildWriteDiffFromSnapshot(
  previousContent: string | undefined,
  nextContent: string,
): { removed: string; added: string } | undefined {
  if (!nextContent && previousContent === undefined) return undefined;
  const removed = previousContent ?? "";
  const added = nextContent;
  if (!removed && !added) return undefined;
  return { removed, added };
}

/** Build editor preview from tool input/output (works while running if input is available). */
export function getWorkspaceFileEditorPreview(
  toolName: string,
  input: unknown,
  data: unknown,
): WorkspaceFileEditorPreview | null {
  const effectiveTool = effectiveWorkspaceToolId(toolName, input);
  if (effectiveTool !== toolName) {
    return getWorkspaceFileEditorPreview(effectiveTool, input, data);
  }

  const inputPath = readInputPath(input);

  switch (toolName) {
    case "workspace_action_file_read": {
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
    case "workspace_action_file_write": {
      const inputContent = readInputString(input, "content");
      const payload = parseWorkspaceFilePayload(toolName, data);
      const path = payload?.action === "file-write"
        ? payload.path
        : inputPath;
      if (!path || inputContent === undefined) return path ? { path, content: "" } : null;
      const body = readToolDataString(data, "content") ?? inputContent;
      const previousContent = readToolDataString(data, "previousContent");
      return {
        path,
        content: body,
        diff:
          previousContent !== undefined
            ? buildWriteDiffFromSnapshot(previousContent, body)
            : buildWritePreviewDiff(body),
        previousSnapshotTruncated:
          isRecord(data) && data.previousTruncated === true
            ? true
            : undefined,
      };
    }
    case "workspace_action_file_edit":
    case "workspace_action_edit_data": {
      const oldString = readInputString(input, "oldString");
      const newString = readInputString(input, "newString");
      const payload = parseWorkspaceFilePayload(toolName, data);
      const path = payload?.action === "file-edit"
        ? payload.path
        : inputPath;
      if (!path || !oldString) return path ? { path, content: "" } : null;
      const previousContent = readToolDataString(data, "previousContent");
      const writtenContent = readToolDataString(data, "content");
      if (
        toolName === "workspace_action_file_edit"
        && previousContent !== undefined
        && writtenContent !== undefined
      ) {
        return {
          path,
          content: writtenContent,
          diff: buildWriteDiffFromSnapshot(previousContent, writtenContent),
          replacements: payload?.action === "file-edit" ? payload.replacements : undefined,
        };
      }
      return {
        path,
        content: newString ?? "",
        diff: { removed: oldString, added: newString ?? "" },
        replacements: payload?.action === "file-edit" ? payload.replacements : undefined,
      };
    }
    case "workspace_action_read_data": {
      if (isRecord(data) && isProgramDataSummaryAction(data.action)) {
        const id = readInputActionId(input);
        return {
          path: id ? formatActionDataJsonPath(id) : "data.json",
          content: formatProgramDataSummaryPreview(data),
        };
      }
      const read = parseWorkspaceFileReadPayload(data);
      if (read) {
        return {
          path: read.path,
          content: read.content,
          truncated: read.truncated,
          totalChars: read.totalChars,
        };
      }
      const id = readInputActionId(input);
      if (!id) return null;
      if (!data) {
        return { path: formatActionDataJsonPath(id), content: "" };
      }
      return null;
    }
    case "workspace_action_write_data": {
      const content = readInputString(input, "content");
      const payload = parseWorkspaceFilePayload(toolName, data);
      const path = payload?.action === "file-write" ? payload.path : undefined;
      const id = readInputActionId(input);
      const body = content ?? "";
      const previousContent = readToolDataString(data, "previousContent");
      const diff =
        previousContent !== undefined
          ? buildWriteDiffFromSnapshot(previousContent, body)
          : buildWritePreviewDiff(body);
      if (path) {
        return {
          path,
          content: body,
          diff,
          previousSnapshotTruncated:
            isRecord(data) && data.previousTruncated === true
              ? true
              : undefined,
        };
      }
      if (!id) return null;
      return {
        path: formatActionDataJsonPath(id),
        content: body,
        diff,
        previousSnapshotTruncated:
          isRecord(data) && data.previousTruncated === true
            ? true
            : undefined,
      };
    }
    default:
      return null;
  }
}
