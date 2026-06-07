import { isStructuredToolResult } from "@/lib/tool-result";
import {
  isProgramDiagnosticsTool as isProgramDiagnosticsToolName,
  WORKSPACE_PROGRAM_DIAGNOSTICS_TOOL,
} from "@/lib/workspace-program-tool";

export { WORKSPACE_PROGRAM_DIAGNOSTICS_TOOL };

const DIAGNOSTICS_ACTIONS = new Set([
  "program-diagnostics",
  "project-diagnostics-get",
]);

export type ProgramDiagnosticsReadHint = {
  tool?: string;
  action?: string;
  path?: string;
  startLine?: number;
  endLine?: number;
  mode?: string;
};

export type ProgramDiagnosticsIssue = {
  severity: "error" | "warning";
  kind?: string;
  code: string;
  message: string;
  locationSummary?: string;
  location?: {
    stepPath?: string;
    stepId?: string;
    stepRunnerKey?: string;
    paramName?: string;
    variableKey?: string;
    file?: string;
    line?: number;
    column?: number;
    dataJsonPath?: string;
    read?: ProgramDiagnosticsReadHint;
  };
};

export type ProgramDiagnosticsSummary = {
  errorCount: number;
  warningCount: number;
  checked: number;
  skipped: number;
  totalChecks?: number;
  truncated?: number;
  fastIssueCount?: number;
};

export type ProgramDiagnosticsView = {
  program?: string;
  target?: string;
  id?: string;
  status: string;
  summary?: ProgramDiagnosticsSummary;
  issues: ProgramDiagnosticsIssue[];
  issueCount?: number;
  hint?: string;
  lintError?: string;
  startedAt?: string;
  completedAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readSeverity(value: unknown): "error" | "warning" {
  const s = readString(value)?.toLowerCase();
  return s === "warning" ? "warning" : "error";
}

function readReadHint(value: unknown): ProgramDiagnosticsReadHint | undefined {
  if (!isRecord(value)) return undefined;
  const tool = readString(value.tool);
  const action = readString(value.action);
  const path = readString(value.path);
  const mode = readString(value.mode);
  const startLine =
    typeof value.startLine === "number" && value.startLine > 0
      ? Math.trunc(value.startLine)
      : undefined;
  const endLine =
    typeof value.endLine === "number" && value.endLine > 0
      ? Math.trunc(value.endLine)
      : undefined;
  if (!tool && !action && !path && !mode && startLine == null) return undefined;
  return { tool, action, path, mode, startLine, endLine };
}

function resolveReadAction(read: ProgramDiagnosticsReadHint): string | undefined {
  if (read.action) return read.action;
  if (read.tool === "workspace_action_file_read") return "file_read";
  if (read.tool === "workspace_action_read_data") return "read_data";
  if (read.tool === "workspace_program" && read.path) return "file_read";
  if (read.tool === "workspace_program" && read.mode) return "read_data";
  return undefined;
}

/** Compact read hint for diagnostics issue rows (supports legacy read.tool values). */
export function formatProgramDiagnosticsReadLine(
  read: ProgramDiagnosticsReadHint,
): string | null {
  const action = resolveReadAction(read);
  if (action === "file_read" && read.path) {
    if (read.startLine != null && read.endLine != null) {
      return `${read.path} L${read.startLine}-${read.endLine}`;
    }
    if (read.startLine != null) {
      return `${read.path} L${read.startLine}`;
    }
    return read.path;
  }
  if (action === "read_data") {
    return `read_data mode=${read.mode ?? "content"}`;
  }
  return read.tool ?? null;
}

function readLocation(value: unknown): ProgramDiagnosticsIssue["location"] {
  if (!isRecord(value)) return undefined;
  const line =
    typeof value.line === "number" && value.line > 0
      ? Math.trunc(value.line)
      : undefined;
  const column =
    typeof value.column === "number" && value.column > 0
      ? Math.trunc(value.column)
      : undefined;
  return {
    stepPath: readString(value.stepPath),
    stepId: readString(value.stepId),
    stepRunnerKey: readString(value.stepRunnerKey),
    paramName: readString(value.paramName),
    variableKey: readString(value.variableKey),
    file: readString(value.file),
    line,
    column,
    dataJsonPath: readString(value.dataJsonPath),
    read: readReadHint(value.read),
  };
}

function readIssue(value: unknown): ProgramDiagnosticsIssue | null {
  if (!isRecord(value)) return null;
  const code = readString(value.code) ?? "?";
  const message = readString(value.message) ?? "";
  return {
    severity: readSeverity(value.severity),
    kind: readString(value.kind),
    code,
    message,
    locationSummary: readString(value.locationSummary),
    location: readLocation(value.location),
  };
}

function readSummary(value: unknown): ProgramDiagnosticsSummary | undefined {
  if (!isRecord(value)) return undefined;
  const errorCount =
    typeof value.errorCount === "number" ? Math.max(0, value.errorCount) : 0;
  const warningCount =
    typeof value.warningCount === "number" ? Math.max(0, value.warningCount) : 0;
  const checked =
    typeof value.checked === "number" ? Math.max(0, value.checked) : 0;
  const skipped =
    typeof value.skipped === "number" ? Math.max(0, value.skipped) : 0;
  const totalChecks =
    typeof value.totalChecks === "number" ? Math.max(0, value.totalChecks) : undefined;
  const truncated =
    typeof value.truncated === "number" ? Math.max(0, value.truncated) : undefined;
  const fastIssueCount =
    typeof value.fastIssueCount === "number"
      ? Math.max(0, value.fastIssueCount)
      : undefined;
  return {
    errorCount,
    warningCount,
    checked,
    skipped,
    totalChecks,
    truncated,
    fastIssueCount,
  };
}

function isDiagnosticsPayload(data: Record<string, unknown>): boolean {
  const action = readString(data.action);
  if (action && DIAGNOSTICS_ACTIONS.has(action)) return true;
  return readString(data.schema) === "qkrpc.program-diagnostics.v1";
}

export function isProgramDiagnosticsTool(
  toolName: string,
  input?: unknown,
): boolean {
  return isProgramDiagnosticsToolName(toolName, input);
}

export function parseProgramDiagnosticsFromToolData(
  data: unknown,
): ProgramDiagnosticsView | null {
  if (!isRecord(data) || !isDiagnosticsPayload(data)) return null;
  const status = readString(data.status) ?? "none";
  const rawIssues = Array.isArray(data.issues) ? data.issues : [];
  const issues = rawIssues
    .map(readIssue)
    .filter((row): row is ProgramDiagnosticsIssue => row !== null);

  return {
    program: readString(data.program),
    target: readString(data.target),
    id: readString(data.id),
    status,
    summary: readSummary(data.summary),
    issues,
    issueCount:
      typeof data.issueCount === "number"
        ? data.issueCount
        : issues.length,
    hint: readString(data.hint),
    lintError: readString(data.lintError),
    startedAt: readString(data.startedAt),
    completedAt: readString(data.completedAt),
  };
}

export function parseProgramDiagnosticsFromToolOutput(
  output: unknown,
): ProgramDiagnosticsView | null {
  if (!isStructuredToolResult(output)) return null;
  return parseProgramDiagnosticsFromToolData(output.data);
}

const STATUS_LABELS: Record<string, string> = {
  ready: "就绪",
  running: "检查中",
  stale: "已过期",
  failed: "失败",
  none: "无快照",
};

export function formatProgramDiagnosticsStatusLabel(status: string): string {
  return STATUS_LABELS[status.toLowerCase()] ?? status;
}

export function formatProgramDiagnosticsMetaLine(
  view: ProgramDiagnosticsView,
): string {
  const statusLabel = formatProgramDiagnosticsStatusLabel(view.status);
  const errors = view.summary?.errorCount ?? 0;
  const warnings = view.summary?.warningCount ?? 0;
  const program = view.program?.trim();

  if (view.status === "running") {
    const fast = view.summary?.fastIssueCount ?? 0;
    const suffix = fast > 0 ? ` · ${fast} 条快速检查` : "";
    return program ? `${program} · ${statusLabel}${suffix}` : `${statusLabel}${suffix}`;
  }
  if (errors > 0 || warnings > 0) {
    const parts = [
      errors > 0 ? `${errors} 错误` : null,
      warnings > 0 ? `${warnings} 警告` : null,
    ].filter(Boolean);
    const counts = parts.join(" · ");
    return program ? `${program} · ${counts}` : counts;
  }
  const ok = program ? `${program} · ` : "";
  return `${ok}${statusLabel} · 0 错误`;
}
