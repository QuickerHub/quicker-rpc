// Pure output labels shared by chat rendering and offline message layout.
import { actionSourceResultMeta } from "@/lib/qkrpc-action-source";
import { formatActionMetadataMetaLine, parseActionMetadata } from "@/lib/action-metadata";
import {
  formatQkrpcActionCommandResultMeta,
  isQkrpcActionCommandTool,
  isQkrpcActionCreateTool,
  qkrpcActionCommandDisplayName,
  qkrpcActionCreateDisplayName,
  readActionCreateTitleFromInput,
} from "@/lib/qkrpc-action-tool";
import {
  formatActionListMetaLine,
  isActionListTool,
  parseActionListFromQkrpcData,
} from "@/lib/action-list";
import {
  formatActionProjectsMetaLine,
  isActionProjectsTool,
  parseActionProjectsFromToolData,
  actionProjectsToolDisplayName,
} from "@/lib/action-projects";
import {
  formatFaSearchMetaLine,
  isFaSearchTool,
  parseFaSearchFromQkrpcData,
} from "@/lib/fa-search";
import { formatWorkspaceToolMetaLine, parseWorkspaceToolDisplay } from "@/lib/action-project-display";
import { parseSearchActionSummaries } from "@/lib/agent-api";
import { isDocsTool, summarizeDocsToolOutput } from "@/lib/docs-tool";
import { isWebSearchTool, summarizeWebSearchOutput } from "@/lib/web-search-tool";
import { isShellToolName, SHELL_TOOL } from "@/lib/host-tool-constants";
import { isStructuredToolResult } from "@/lib/tool-result";
import { defaultEnabledToolIds, getToolMeta } from "@/lib/tool-registry";
import { normalizeToolCallName, resolveKnownToolName } from "@/lib/repair-tool-call";
import {
  isWorkspaceExplorerFileTool,
  summarizeWorkspaceFileTool,
  workspaceFileToolDisplayName,
} from "@/lib/workspace-file-tool";
import { workspaceProgramToolDisplayName } from "@/lib/workspace-program-tool";
import {
  formatProgramDiagnosticsMetaLine,
  isProgramDiagnosticsTool,
  parseProgramDiagnosticsFromToolData,
} from "@/lib/program-diagnostics-view";
import {
  formatStepRunnerGetMetaLine,
  formatStepRunnerSearchMetaLine,
  isStepRunnerGetTool,
  isStepRunnerSearchTool,
  parseStepRunnerGetFromQkrpcData,
  parseStepRunnerSearchFromQkrpcData,
  parseStepRunnerSearchResult,
} from "@/lib/step-runner-tool";
import {
  formatShellExitMeta,
  parseShellToolView,
  summarizeShellToolInput,
} from "@/lib/shell-tool-view";
import {
  summarizeAskQuestionOutput,
  isAskQuestionTool,
  isAskQuestionAwaitingInput,
  askQuestionDisplayTitle,
} from "@/lib/ask-question-tool";
import { TASK_TOOL } from "@/lib/task-tool-constants";
import { summarizeTaskToolOutput, taskToolDisplayTitle } from "@/lib/task-tool-display";
import { BROWSER_TOOL } from "@/lib/browser-tool-constants";
import { summarizeBrowserToolOutput } from "@/lib/browser-tool-result";

export type QkrpcToolResult = {
  ok: boolean;
  exitCode: number;
  data: unknown;
  displayData?: unknown;
  stderr?: string;
  truncated?: boolean;
  source?: "local" | "qkrpc";
};

export function isQkrpcToolResult(value: unknown): value is QkrpcToolResult {
  return isStructuredToolResult(value);
}

export function summarizeToolOutput(
  toolName: string,
  output: unknown,
  input?: unknown,
): string | null {
  if (!isQkrpcToolResult(output)) return null;
  if (typeof output.data === "object" && output.data !== null) {
    const sourceSummary = actionSourceResultMeta(toolName, input, output.data, output.ok);
    if (sourceSummary) return sourceSummary;
  }

  if (isShellToolName(toolName)) {
    const view = parseShellToolView(output);
    if (view) return formatShellExitMeta(view);
    const inputSummary = summarizeShellToolInput(input);
    if (inputSummary) return inputSummary.slice(0, 96);
    return output.ok ? "完成" : "失败";
  }

  if (isAskQuestionTool(toolName)) {
    return summarizeAskQuestionOutput(output);
  }

  if (toolName === TASK_TOOL) {
    return summarizeTaskToolOutput(output);
  }

  if (isWorkspaceExplorerFileTool(toolName, input)) {
    const fileSummary = summarizeWorkspaceFileTool(toolName, output, input);
    if (fileSummary) return fileSummary;
  }

  if (isDocsTool(toolName)) {
    const docSummary = summarizeDocsToolOutput(toolName, output);
    if (docSummary) return docSummary;
  }

  if (isWebSearchTool(toolName)) {
    const searchSummary = summarizeWebSearchOutput(output);
    if (searchSummary) return searchSummary;
  }

  if (toolName === BROWSER_TOOL) {
    const browserSummary = summarizeBrowserToolOutput(output, input);
    if (browserSummary) return browserSummary;
  }

  if (output.ok && input !== undefined) {
    const inputMeta = parseActionMetadata(input);
    if (inputMeta) return formatActionMetadataMetaLine(inputMeta);
  }

  if (!output.ok) {
    const err =
      typeof output.data === "object"
      && output.data !== null
      && "error" in output.data
      && typeof (output.data as { error: unknown }).error === "string"
        ? (output.data as { error: string }).error
        : output.stderr;
    return err ? `失败 · ${err.slice(0, 80)}` : `失败 · exit ${output.exitCode}`;
  }

  const data = output.data;
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    if (d.status === "transient_error") {
      return d.kind === "timeout" ? "超时（已重试）" : "暂时失败（已重试）";
    }
    if (d.action === "ping" && d.pong) {
      return `pong · ${String(d.pipe ?? "")}`;
    }
    if (Array.isArray(d.actions)) {
      return `${d.actions.length} 个动作`;
    }
    if (isActionListTool(toolName, input)) {
      const list = parseActionListFromQkrpcData(toolName, output.data, input);
      if (list) return formatActionListMetaLine(list.meta);
    }
    if (isFaSearchTool(toolName, input)) {
      const fa = parseFaSearchFromQkrpcData(output.data);
      if (fa) return formatFaSearchMetaLine(fa.meta);
    }
    if (isStepRunnerGetTool(toolName)) {
      const detail = parseStepRunnerGetFromQkrpcData(output.data, input);
      if (detail) return formatStepRunnerGetMetaLine(detail);
    }
    if (isStepRunnerSearchTool(toolName)) {
      const searchResult = parseStepRunnerSearchResult(output.data, input);
      if (searchResult) {
        return formatStepRunnerSearchMetaLine(searchResult, {
          items: searchResult.items,
          controlFieldItemCount: searchResult.controlFieldItemCount,
          multiControlFieldCount: searchResult.multiControlFieldCount,
        });
      }
      const search = parseStepRunnerSearchFromQkrpcData(output.data, input);
      if (search) return formatStepRunnerSearchMetaLine(search);
    }
    if (isActionProjectsTool(toolName, input)) {
      const projects = parseActionProjectsFromToolData(output.data);
      if (projects) return formatActionProjectsMetaLine(projects);
    }
    if (isProgramDiagnosticsTool(toolName, input)) {
      const diagnostics = parseProgramDiagnosticsFromToolData(output.data);
      if (diagnostics) return formatProgramDiagnosticsMetaLine(diagnostics);
    }
    if (isQkrpcActionCommandTool(toolName, input)) {
      const actionMeta = formatQkrpcActionCommandResultMeta(
        toolName,
        input ?? {},
        d,
        output.ok,
      );
      if (actionMeta) return actionMeta;
    }
    if (isQkrpcActionCreateTool(toolName, input)) {
      const title =
        readActionCreateTitleFromInput(input)
        ?? (typeof d.title === "string" ? d.title.trim() : "")
        ?? (typeof d.actionTitle === "string" ? d.actionTitle.trim() : "");
      if (title) return title;
    }
    const workspaceDisplay = parseWorkspaceToolDisplay(output.data);
    if (
      workspaceDisplay
      && (
        toolName === "qkrpc_action_get"
        || toolName === "qkrpc_action_create"
        || toolName === "qkrpc_action_patch"
      )
    ) {
      return formatWorkspaceToolMetaLine(workspaceDisplay);
    }
    const summaries = parseSearchActionSummaries(output.data);
    if (summaries?.items && summaries.items.length > 0) {
      return formatActionListMetaLine({
        source: "list",
        query: summaries.query?.trim() || undefined,
        scope: summaries.scope?.trim() || undefined,
        matchCount: summaries.matchCount ?? summaries.items.length,
      });
    }
    if (Array.isArray(d.results)) {
      return `${d.results.length} 条结果`;
    }
    if (d.action === "delete" && output.ok) {
      return typeof d.message === "string"
        ? d.message.slice(0, 60)
        : "已删除动作";
    }
    if (
      (toolName === "qkrpc_action_publish" || toolName === "qkrpc_action_update")
      && output.ok
    ) {
      const mode = typeof d.mode === "string" ? d.mode : undefined;
      const url = typeof d.shareUrl === "string" ? d.shareUrl.trim() : "";
      const msg = typeof d.message === "string" ? d.message.trim() : "";
      if (mode === "publish" && url) return `首次分享 · ${url}`;
      if (mode === "update" || d.action === "update") {
        return msg ? `已更新 · ${msg.slice(0, 48)}` : "已更新分享";
      }
      if (msg) return msg.slice(0, 60);
    }
    if (typeof d.actionTitle === "string" && d.actionTitle.trim()) {
      return d.actionTitle.trim();
    }
    if (typeof d.actionId === "string") {
      return `action ${d.actionId.slice(0, 8)}…`;
    }
    if (typeof d.title === "string") {
      return d.title;
    }
  }

  if (toolName.startsWith("qkrpc_") && output.ok) {
    return "成功";
  }
  if (isDocsTool(toolName) && output.ok) {
    return "成功";
  }
  return null;
}

function formatStateLabel(state: string): string {
  switch (state) {
    case "input-streaming":
      return "接收参数";
    case "input-available":
      return "执行中";
    case "approval-requested":
      return "待确认";
    case "approval-responded":
      return "已响应";
    case "output-available":
      return "完成";
    case "output-error":
      return "失败";
    case "output-denied":
      return "已取消";
    default:
      return state;
  }
}

export function formatToolState(state: string): string {
  return formatStateLabel(state);
}

/** qkrpc_step_runner_search → step runner search */
export function readQkrpcToolOutputData(output: unknown): Record<string, unknown> | null {
  if (!isQkrpcToolResult(output)) return null;
  if (typeof output.data !== "object" || output.data === null || Array.isArray(output.data)) {
    return null;
  }
  return output.data as Record<string, unknown>;
}

export function formatToolDisplayName(
  toolName: string,
  input?: unknown,
  output?: unknown,
): string {
  const outputData = readQkrpcToolOutputData(output);
  const canonical =
    resolveKnownToolName(toolName, defaultEnabledToolIds())
    ?? normalizeToolCallName(toolName);
  if (canonical === SHELL_TOOL || canonical === "shell_exec") return "终端";
  if (isAskQuestionTool(canonical)) {
    return askQuestionDisplayTitle(input);
  }
  if (canonical === TASK_TOOL) {
    return taskToolDisplayTitle(input);
  }
  const createLabel = qkrpcActionCreateDisplayName(canonical, input);
  if (createLabel) return createLabel;
  const fileLabel = workspaceFileToolDisplayName(canonical, input);
  if (fileLabel) return fileLabel;
  const projectsLabel = actionProjectsToolDisplayName(canonical, input);
  if (projectsLabel) return projectsLabel;
  const programLabel = workspaceProgramToolDisplayName(canonical, input);
  if (programLabel) return programLabel;
  const actionCommandLabel = qkrpcActionCommandDisplayName(
    canonical,
    input,
    outputData,
  );
  if (actionCommandLabel) return actionCommandLabel;
  const meta = getToolMeta(canonical);
  if (meta?.label) return meta.label;
  return canonical.replace(/^qkrpc_/, "").replace(/_/g, " ");
}

export function buildToolSummaryMeta(
  state: string,
  summary: string | null,
  toolName?: string,
): string {
  if (toolName && isAskQuestionAwaitingInput(toolName, state)) {
    return "待你选择";
  }
  switch (state) {
    case "input-streaming":
      return "接收参数…";
    case "input-available":
      return "执行中…";
    case "approval-requested":
      return "待你确认";
    case "approval-responded":
      return "处理中…";
    case "output-denied":
      return "已取消";
    case "output-error":
      return summary ?? "失败";
    case "output-available":
      if (summary && summary !== "成功") return summary;
      return summary === "成功" ? "完成" : (summary ?? "完成");
    default:
      return summary ?? state;
  }
}
