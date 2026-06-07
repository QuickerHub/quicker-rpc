"use client";

import { type ReactNode, useRef } from "react";
import { useFollowScrollTail } from "@/lib/use-follow-scroll-tail";
import {
  formatActionMetadataMetaLine,
  parseActionMetadata,
  splitActionMetadataFields,
} from "@/lib/action-metadata";
import {
  formatQkrpcActionCommandResultMeta,
  isQkrpcActionCommandTool,
  qkrpcActionCommandDisplayName,
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
import {
  formatWorkspaceToolMetaLine,
  parseWorkspaceToolDisplay,
} from "@/lib/action-project-display";
import {
  formatJsonDisplayText,
  shouldUseJsonEditor,
  tryParseJsonString,
} from "@/lib/format-json-display";
import { ActionListView } from "./ActionListView";
import { ActionProjectsView } from "./ActionProjectsView";
import { FileEditorCard } from "./FileEditorCard";
import { ProgramDiagnosticsResultView } from "./ProgramDiagnosticsResultView";
import { StepRunnerSearchResultView } from "./StepRunnerSearchResultView";
import { ToolJsonEditor } from "./ToolJsonEditor";
import { FaSearchPlainText } from "./FaSearchPlainText";
import { parseSearchActionSummaries } from "@/lib/agent-api";
import {
  isDocsTool,
  summarizeDocsToolOutput,
} from "@/lib/docs-tool";
import { isStructuredToolResult } from "@/lib/tool-result";
import {
  parseSingleIdInput,
  shouldOmitCompactToolResultBody,
  shouldSkipRedundantToolRequest,
} from "@/lib/tool-display";
import {
  defaultEnabledToolIds,
  getToolMeta,
} from "@/lib/tool-registry";
import { normalizeToolCallName, resolveKnownToolName } from "@/lib/repair-tool-call";
import {
  countLines,
  formatCharCount,
  formatWorkspacePathLabel,
  isWorkspaceExplorerFileTool,
  parseWorkspaceFileReadPayload,
  summarizeWorkspaceFileTool,
  type WorkspaceFileReadPayload,
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
  type StepRunnerGetMeta,
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

export type QkrpcToolResult = {
  ok: boolean;
  exitCode: number;
  data: unknown;
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

  if (toolName === "shell_exec") {
    const view = parseShellToolView(output);
    if (view) return formatShellExitMeta(view);
    const inputSummary = summarizeShellToolInput(input);
    if (inputSummary) return inputSummary.slice(0, 96);
    return output.ok ? "完成" : "失败";
  }

  if (isAskQuestionTool(toolName)) {
    return summarizeAskQuestionOutput(output);
  }

  if (isWorkspaceExplorerFileTool(toolName, input)) {
    const fileSummary = summarizeWorkspaceFileTool(toolName, output, input);
    if (fileSummary) return fileSummary;
  }

  if (isDocsTool(toolName)) {
    const docSummary = summarizeDocsToolOutput(toolName, output);
    if (docSummary) return docSummary;
  }

  if (input !== undefined) {
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
      );
      if (actionMeta) return actionMeta;
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
  if (canonical === "shell_exec") return "终端";
  if (isAskQuestionTool(canonical)) {
    return askQuestionDisplayTitle(input);
  }
  const fileLabel = workspaceFileToolDisplayName(canonical, input);
  if (fileLabel) return fileLabel;
  const projectsLabel = actionProjectsToolDisplayName(canonical, input);
  if (projectsLabel) return projectsLabel;
  const programLabel = workspaceProgramToolDisplayName(canonical, input);
  if (programLabel) return programLabel.replace(/-/g, " ");
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

function JsonBlockPre({
  value,
  followTail = false,
}: {
  value: unknown;
  followTail?: boolean;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const text = formatJsonDisplayText(value);

  useFollowScrollTail(preRef, followTail, text);

  return (
    <pre ref={preRef} className="tool-json">
      {text}
    </pre>
  );
}

function JsonBlock({
  value,
  followTail = false,
}: {
  value: unknown;
  followTail?: boolean;
}) {
  if (shouldUseJsonEditor(value)) {
    return <ToolJsonEditor value={value} followTail={followTail} />;
  }
  return <JsonBlockPre value={value} followTail={followTail} />;
}

function valueNeedsBlockLayout(value: unknown): boolean {
  if (typeof value === "object" && value !== null) {
    return shouldUseJsonEditor(value);
  }
  if (typeof value === "string") {
    const parsed = tryParseJsonString(value);
    return shouldUseJsonEditor(parsed ?? value);
  }
  return false;
}

/** Top-level data is a small flat object (no nested structures). */
function isShallowPrimitiveData(data: unknown): boolean {
  if (data === null || data === undefined) return true;
  if (typeof data !== "object" || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;
  if (Object.keys(obj).length > 12) return false;
  return Object.values(obj).every(
    (v) => v === null || v === undefined || typeof v !== "object",
  );
}

function shouldShowRawJsonDetails(
  result: QkrpcToolResult,
  hasRichBody: boolean,
): boolean {
  if (result.truncated || result.stderr) return true;
  if (!result.ok) return true;
  if (hasRichBody) return false;
  const fileRead = parseWorkspaceFileReadPayload(result.data);
  if (fileRead?.content) return false;
  if (fileRead) return true;
  return !isShallowPrimitiveData(result.data);
}

function WorkspaceFileReadResultView({
  payload,
  data,
  compact = false,
  followTail = false,
}: {
  payload: WorkspaceFileReadPayload;
  data: Record<string, unknown>;
  compact?: boolean;
  followTail?: boolean;
}) {
  if (payload.content) {
    const range =
      payload.startLine != null
        ? payload.endLine != null && payload.endLine >= payload.startLine
          ? payload.startLine === payload.endLine
            ? `L${payload.startLine}`
            : `L${payload.startLine}-${payload.endLine}`
          : `L${payload.startLine}`
        : null;
    return (
      <>
        <FileEditorCard
          path={payload.path}
          content={payload.content}
          variant={compact ? "compact" : "full"}
          showHeader
          showContent
          fillAvailable={!compact}
          lineNumbers
          foldSnapshot={false}
          summaryMeta={range ?? undefined}
          running={followTail}
        />
        {payload.truncated ? (
          <p className="file-editor-footnote file-editor-footnote--warn">
            内容已截断
            {payload.totalChars !== undefined
              ? ` · 文件共 ${payload.totalChars} 字符`
              : ""}
            {payload.readHint ? ` · ${payload.readHint}` : ""}
          </p>
        ) : null}
      </>
    );
  }

  const actionId =
    typeof data.actionId === "string" ? data.actionId.trim() : "";
  const entries: Array<{ key: string; value: ReactNode }> = [];
  if (actionId) {
    entries.push({ key: "action", value: <code>{actionId}</code> });
  }
  entries.push({
    key: "path",
    value: (
      <code title={payload.path}>{formatWorkspacePathLabel(payload.path)}</code>
    ),
  });
  return <KeyValueRows entries={entries} />;
}

function ActionMetadataResultBody({
  data,
  inputId,
  followTail = false,
}: {
  data: Record<string, unknown>;
  inputId?: string | null;
  followTail?: boolean;
}) {
  const meta = parseActionMetadata(data);
  if (!meta) return null;

  const { rest } = splitActionMetadataFields(data);
  const id = meta.id?.trim();
  const hasRest = Object.keys(rest).length > 0;

  if (!hasRest && id && inputId && id === inputId) return null;

  if (hasRest) {
    return (
      <>
        {id ? (
          <p className="tool-plain-meta">
            <span className="tool-muted">ID</span>{" "}
            <code>{id}</code>
          </p>
        ) : null}
        <ShallowObjectView data={rest} followTail={followTail} />
      </>
    );
  }

  if (!id) return null;

  return (
    <div className="tool-compact-success">
      <p className="tool-plain-meta">
        <span className="tool-muted">ID</span>{" "}
        <code>{id}</code>
      </p>
    </div>
  );
}

function CompactSuccessBody({
  data,
  inputId,
}: {
  data: Record<string, unknown>;
  inputId?: string | null;
}) {
  const message =
    typeof data.message === "string" ? data.message.trim() : "";
  const actionId =
    typeof data.actionId === "string" ? data.actionId.trim() : "";
  const showId = Boolean(actionId && actionId !== inputId);

  if (!message && !showId) {
    return <ShallowObjectView data={data} />;
  }

  return (
    <div className="tool-compact-success">
      {message ? <p className="tool-plain-result">{message}</p> : null}
      {showId ? (
        <p className="tool-plain-meta">
          <span className="tool-muted">ID</span>{" "}
          <code>{actionId}</code>
        </p>
      ) : null}
    </div>
  );
}

function isFlatRequestParams(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  if (keys.length === 0 || keys.length > 8) return false;
  return keys.every(
    (k) => {
      const v = obj[k];
      return (
        v === null
        || v === undefined
        || typeof v === "string"
        || typeof v === "number"
        || typeof v === "boolean"
      );
    },
  );
}

function StepRunnerGetResultView({ meta }: { meta: StepRunnerGetMeta }) {
  const entries: Array<{ key: string; value: ReactNode }> = [
    { key: "模块", value: <code>{meta.key}</code> },
  ];
  if (meta.name) {
    entries.push({ key: "名称", value: meta.name });
  }
  if (meta.controlField) {
    entries.push({ key: "control", value: <code>{meta.controlField}</code> });
  }
  return <KeyValueRows entries={entries} />;
}

function KeyValueRows({
  entries,
}: {
  entries: Array<{ key: string; value: ReactNode; block?: boolean }>;
}) {
  return (
    <dl className="tool-kv">
      {entries.map(({ key, value, block }) => (
        <div
          key={key}
          className={`tool-kv-row${block ? " tool-kv-row--block" : ""}`}
        >
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function renderValueCell(v: unknown, followTail = false): ReactNode {
  if (v === null || v === undefined) {
    return <span className="tool-muted">—</span>;
  }
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  if (typeof v === "object") {
    if (shouldUseJsonEditor(v)) {
      return <ToolJsonEditor value={v} followTail={followTail} />;
    }
    return (
      <pre className="tool-json tool-json--inline" tabIndex={0}>
        {formatJsonDisplayText(v)}
      </pre>
    );
  }
  if (typeof v === "string") {
    const parsed = tryParseJsonString(v);
    if (parsed !== null) {
      if (shouldUseJsonEditor(parsed)) {
        return <ToolJsonEditor value={parsed} followTail={followTail} />;
      }
      return (
        <pre className="tool-json tool-json--inline" tabIndex={0}>
          {formatJsonDisplayText(parsed)}
        </pre>
      );
    }
  }
  return String(v);
}

function PingDataView({ data }: { data: Record<string, unknown> }) {
  const entries: Array<{ key: string; value: ReactNode }> = [];
  if ("pong" in data) entries.push({ key: "pong", value: renderValueCell(data.pong) });
  if ("pipe" in data) entries.push({ key: "pipe", value: renderValueCell(data.pipe) });
  if ("protocolVersion" in data) {
    entries.push({ key: "protocol", value: renderValueCell(data.protocolVersion) });
  }
  return <KeyValueRows entries={entries} />;
}

function ShallowObjectView({
  data,
  followTail = false,
}: {
  data: Record<string, unknown>;
  followTail?: boolean;
}) {
  const skip = new Set(["ok", "action", "exitCode"]);
  const entries = Object.entries(data)
    .filter(([k, v]) => !skip.has(k) && v !== undefined)
    .slice(0, 12)
    .map(([key, value]) => ({
      key,
      value: renderValueCell(value, followTail),
      block: valueNeedsBlockLayout(value),
    }));

  if (entries.length === 0) {
    return <JsonBlock value={data} followTail={followTail} />;
  }

  return (
    <>
      <KeyValueRows entries={entries} />
      {Object.keys(data).length > 12 && (
        <p className="tool-muted tool-hint">另有 {Object.keys(data).length - 12} 个字段，见完整 JSON</p>
      )}
    </>
  );
}

function WorkspaceToolResultView({
  display,
}: {
  display: NonNullable<ReturnType<typeof parseWorkspaceToolDisplay>>;
}) {
  if (display.syncError) {
    return <p className="tool-plain-result tool-error">{display.syncError}</p>;
  }

  const entries: Array<{ key: string; value: ReactNode }> = [];
  if (display.actionId) {
    entries.push({ key: "ID", value: <code>{display.actionId}</code> });
  }
  if (display.editVersion != null) {
    entries.push({ key: "版本", value: String(display.editVersion) });
  }
  if (display.stepCount != null) {
    entries.push({ key: "步骤", value: String(display.stepCount) });
  }
  if (display.variableCount != null) {
    entries.push({ key: "变量", value: String(display.variableCount) });
  }
  if (display.fileRefCount != null) {
    entries.push({ key: "外置文件", value: String(display.fileRefCount) });
  }
  if (display.projectDirectory) {
    entries.push({
      key: "项目",
      value: (
        <code title={display.projectDirectory}>
          {formatWorkspacePathLabel(display.projectDirectory)}
        </code>
      ),
    });
  }

  if (entries.length === 0) {
    return display.workspaceSynced ? (
      <p className="tool-plain-result">已同步到工作区</p>
    ) : null;
  }

  return <KeyValueRows entries={entries} />;
}

function QkrpcToolResultView({
  result,
  compact,
  toolName,
  followTail = false,
  input,
}: {
  result: QkrpcToolResult;
  compact?: boolean;
  toolName?: string;
  followTail?: boolean;
  input?: unknown;
}) {
  const inputId = parseSingleIdInput(input);

  if (shouldOmitCompactToolResultBody(input, result)) {
    return null;
  }

  const data = result.data;
  const actionList =
    result.ok && toolName
      ? parseActionListFromQkrpcData(toolName, data, input)
      : null;
  const stepRunnerSearch =
    result.ok && toolName && isStepRunnerSearchTool(toolName)
      ? parseStepRunnerSearchResult(data, input)
      : null;
  const stepRunnerGet =
    result.ok && toolName && isStepRunnerGetTool(toolName)
      ? parseStepRunnerGetFromQkrpcData(data, input)
      : null;
  const faSearch =
    result.ok && toolName && isFaSearchTool(toolName)
      ? parseFaSearchFromQkrpcData(data)
      : null;
  const programDiagnostics =
    toolName && isProgramDiagnosticsTool(toolName, input)
      ? parseProgramDiagnosticsFromToolData(data)
      : null;
  const workspaceDisplay =
    result.ok ? parseWorkspaceToolDisplay(data) : null;
  const hasWorkspaceResultBody = Boolean(
    workspaceDisplay
    && (
      workspaceDisplay.syncError
      || workspaceDisplay.workspaceSynced
      || workspaceDisplay.actionId
      || workspaceDisplay.projectDirectory
    ),
  );
  const actionMetadata =
    result.ok
    && !hasWorkspaceResultBody
    && typeof data === "object"
    && data !== null
    && !Array.isArray(data)
      ? parseActionMetadata(data)
      : null;
  const metadataRest =
    actionMetadata && typeof data === "object" && data !== null && !Array.isArray(data)
      ? splitActionMetadataFields(data).rest
      : null;
  const hasMetadataResultBody = Boolean(
    actionMetadata
    && (actionMetadata.id?.trim() || (metadataRest && Object.keys(metadataRest).length > 0)),
  );
  const fileReadPayload =
    result.ok
    && typeof data === "object"
    && data !== null
    && !Array.isArray(data)
      ? parseWorkspaceFileReadPayload(data)
      : null;
  const hasFileReadContentBody = Boolean(fileReadPayload?.content);
  const hasRichBody = Boolean(
    actionList
    || stepRunnerSearch
    || stepRunnerGet
    || faSearch
    || programDiagnostics
    || hasMetadataResultBody
    || hasWorkspaceResultBody
    || hasFileReadContentBody,
  );

  let resultBody: ReactNode = null;
  if (data !== undefined && data !== null) {
    if (actionList) {
      resultBody = (
        <ActionListView meta={actionList.meta} items={actionList.items} snapshot />
      );
    } else if (stepRunnerSearch) {
      resultBody = <StepRunnerSearchResultView result={stepRunnerSearch} />;
    } else if (stepRunnerGet) {
      resultBody = <StepRunnerGetResultView meta={stepRunnerGet} />;
    } else if (faSearch) {
      resultBody = (
        <FaSearchPlainText names={faSearch.names} />
      );
    } else if (programDiagnostics) {
      resultBody = <ProgramDiagnosticsResultView view={programDiagnostics} />;
    } else if (hasWorkspaceResultBody && workspaceDisplay) {
      resultBody = <WorkspaceToolResultView display={workspaceDisplay} />;
    } else if (actionMetadata) {
      resultBody = (
        <ActionMetadataResultBody
          data={data as Record<string, unknown>}
          inputId={inputId}
          followTail={followTail}
        />
      );
    } else if (
      typeof data === "object"
      && data !== null
      && !Array.isArray(data)
      && (data as Record<string, unknown>).action === "ping"
    ) {
      resultBody = <PingDataView data={data as Record<string, unknown>} />;
    } else if (
      result.ok
      && typeof data === "object"
      && data !== null
      && !Array.isArray(data)
    ) {
      if (fileReadPayload) {
        resultBody = (
          <WorkspaceFileReadResultView
            payload={fileReadPayload}
            data={data as Record<string, unknown>}
            compact={compact}
            followTail={followTail}
          />
        );
      }
    }

    if (
      resultBody === null
      && compact
      && result.ok
      && typeof data === "object"
      && data !== null
      && !Array.isArray(data)
      && isShallowPrimitiveData(data)
      && (typeof (data as Record<string, unknown>).message === "string"
        || typeof (data as Record<string, unknown>).actionId === "string")
      && !parseWorkspaceFileReadPayload(data)
    ) {
      resultBody = (
        <CompactSuccessBody
          data={data as Record<string, unknown>}
          inputId={inputId}
        />
      );
    }

    if (resultBody === null && typeof data === "object" && data !== null && !Array.isArray(data)) {
      resultBody = (
        <ShallowObjectView
          data={data as Record<string, unknown>}
          followTail={followTail}
        />
      );
    } else if (resultBody === null) {
      resultBody = <JsonBlock value={data} followTail={followTail} />;
    }
  }

  const showRawJson = shouldShowRawJsonDetails(result, hasRichBody);

  return (
    <div className="tool-result">
      {(!compact || !result.ok) && (
        <div
          className={`tool-status-badge ${result.ok ? "tool-status-badge--ok" : "tool-status-badge--err"}`}
        >
          {result.ok ? "成功" : "失败"}
          <span className="tool-muted">exit {result.exitCode}</span>
        </div>
      )}

      {result.stderr && (
        <pre className="tool-stderr">{result.stderr}</pre>
      )}

      {result.truncated && (
        <p className="tool-hint tool-muted">输出已截断，请缩小查询范围</p>
      )}

      {resultBody !== null && (
        <div className="tool-result-body">{resultBody}</div>
      )}

      {showRawJson && <ToolRawJsonDetails value={result} />}
    </div>
  );
}

export function ToolRawJsonDetails({ value }: { value: unknown }) {
  return (
    <div className="tool-raw-json tool-raw-json--static">
      <div className="tool-section-label">原始 JSON（调试）</div>
      <JsonBlock value={value} />
    </div>
  );
}

export function ActionMetadataRequestSection({
  input,
  label = "请求",
}: {
  input: unknown;
  label?: string;
}) {
  const { meta, rest } = splitActionMetadataFields(input);
  if (!meta || Object.keys(rest).length === 0) return null;

  return (
    <div className="tool-section">
      <div className="tool-section-label">
        <span>{label}</span>
      </div>
      <JsonBlock value={rest} />
    </div>
  );
}

export function ActionListToolBody({
  input,
  output,
  toolName,
}: {
  input?: unknown;
  output: QkrpcToolResult;
  toolName: string;
}) {
  const list = parseActionListFromQkrpcData(toolName, output.data, input);
  if (!output.ok || !list) {
    return (
      <ToolPayloadView label="结果" value={output} compact toolName={toolName} />
    );
  }

  return (
    <>
      <ActionListView meta={list.meta} items={list.items} showMeta={false} snapshot />
    </>
  );
}

export function DocsToolBody({
  output,
  toolName,
}: {
  output: QkrpcToolResult;
  toolName: string;
}) {
  return (
    <ToolPayloadView label="结果" value={output} compact toolName={toolName} />
  );
}

function unwrapSinglePayloadField(value: unknown): {
  fieldKey: string;
  value: unknown;
} | null {
  let data: unknown = value;
  if (isQkrpcToolResult(value)) {
    data = value.data;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }

  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj).filter(
    (key) => !["ok", "action", "exitCode"].includes(key) && obj[key] !== undefined,
  );
  if (keys.length !== 1 || keys[0] !== "payload") {
    return null;
  }

  const inner = obj.payload;
  if (isQkrpcToolResult(value)) {
    return { fieldKey: "payload", value: { ...value, data: inner } };
  }
  return { fieldKey: "payload", value: inner };
}

export function ToolPayloadView({
  label,
  value,
  compact,
  dense,
  rawOnly,
  toolName,
  followTail = false,
  input,
  output,
}: {
  label: string;
  value: unknown;
  compact?: boolean;
  /** Popup layout: tighter section chrome. */
  dense?: boolean;
  /** Popup「源码」tab: full JSON only, no tables or compact summaries. */
  rawOnly?: boolean;
  toolName?: string;
  followTail?: boolean;
  input?: unknown;
  output?: unknown;
}) {
  if (value === undefined) return null;

  if (rawOnly) {
    return (
      <div className={`tool-section tool-section--raw-json${dense ? " tool-section--dense" : ""}`}>
        <div className="tool-section-label">
          <span>{label}</span>
        </div>
        <JsonBlock value={value} followTail={followTail} />
      </div>
    );
  }

  if (label === "请求" && shouldSkipRedundantToolRequest(input ?? value, output)) {
    return null;
  }

  if (label === "结果" && shouldOmitCompactToolResultBody(input, value)) {
    return null;
  }

  const emptyObject =
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value as object).length === 0;

  if (emptyObject) return null;

  if (label === "请求" && !isQkrpcToolResult(value) && parseActionMetadata(value)) {
    return <ActionMetadataRequestSection input={value} label={label} />;
  }

  if (label === "请求" && isFlatRequestParams(value)) {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([key, v]) => ({
        key,
        value: renderValueCell(v),
      }));
    return (
      <div
        className={`tool-section tool-section--request-compact${dense ? " tool-section--dense" : ""}`}
      >
        <div className="tool-section-label">
          <span>{label}</span>
        </div>
        <KeyValueRows entries={entries} />
      </div>
    );
  }

  const payloadInline = unwrapSinglePayloadField(value);
  const displayValue = payloadInline?.value ?? value;
  const showPayloadKey = payloadInline && !dense;

  return (
    <div className={`tool-section${dense ? " tool-section--dense" : ""}`}>
      <div className="tool-section-label">
        <span>{label}</span>
        {showPayloadKey && (
          <span className="tool-section-label-key">{payloadInline.fieldKey}</span>
        )}
      </div>
      {isQkrpcToolResult(displayValue) ? (
        <QkrpcToolResultView
          result={displayValue}
          compact={compact}
          toolName={toolName}
          followTail={followTail}
          input={input}
        />
      ) : (
        <JsonBlock value={displayValue} followTail={followTail} />
      )}
    </div>
  );
}
