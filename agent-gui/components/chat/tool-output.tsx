"use client";

import { type ReactNode, useRef } from "react";
import { useFollowScrollTail } from "@/lib/use-follow-scroll-tail";
import { parseActionMetadata, splitActionMetadataFields } from "@/lib/action-metadata";
import { parseActionListFromQkrpcData } from "@/lib/action-list";
import { isFaSearchTool, parseFaSearchFromQkrpcData } from "@/lib/fa-search";
import { parseWorkspaceToolDisplay } from "@/lib/action-project-display";
import {
  formatJsonDisplayText,
  shouldUseJsonEditor,
  tryParseJsonString,
} from "@/lib/format-json-display";
import { ActionListView } from "./ActionListView";
import { FileEditorCard } from "./FileEditorCard";
import { ProgramDiagnosticsResultView } from "./ProgramDiagnosticsResultView";
import { StepRunnerSearchResultView } from "./StepRunnerSearchResultView";
import { ToolJsonEditor } from "./ToolJsonEditor";
import { FaSearchPlainText } from "./FaSearchPlainText";
import { isStructuredToolResult, resolveToolResultForDisplay } from "@/lib/tool-result";
import {
  parseSingleIdInput,
  shouldOmitCompactToolResultBody,
  shouldSkipRedundantToolRequest,
} from "@/lib/tool-display";
import {
  formatWorkspacePathLabel,
  parseWorkspaceFileReadPayload,
  type WorkspaceFileReadPayload,
} from "@/lib/workspace-file-tool";
import { isProgramDiagnosticsTool, parseProgramDiagnosticsFromToolData } from "@/lib/program-diagnostics-view";
import {
  isStepRunnerGetTool,
  isStepRunnerSearchTool,
  parseStepRunnerGetFromQkrpcData,
  type StepRunnerGetMeta,
  parseStepRunnerSearchResult,
} from "@/lib/step-runner-tool";
import { BROWSER_TOOL } from "@/lib/browser-tool-constants";
import { parseBrowserToolResultView, redactBrowserBinaryFields } from "@/lib/browser-tool-result";
import { BrowserToolResultView } from "./BrowserToolResultView";
import { parseDocsToolInlineResult } from "@/lib/docs-tool-view";
import { DocsToolOutputView } from "./DocsToolResultViews";
import { isQkrpcToolResult, type QkrpcToolResult } from "@/lib/tool-output-summary";

export {
  isQkrpcToolResult,
  summarizeToolOutput,
  formatToolState,
  readQkrpcToolOutputData,
  formatToolDisplayName,
  buildToolSummaryMeta,
  type QkrpcToolResult,
} from "@/lib/tool-output-summary";

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
  if (!followTail && shouldUseJsonEditor(value)) {
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
  const displayResult = isStructuredToolResult(result)
    ? resolveToolResultForDisplay(result)
    : result;

  if (shouldOmitCompactToolResultBody(input, result)) {
    return null;
  }

  const data = displayResult.data;
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
  const browserView =
    toolName === BROWSER_TOOL ? parseBrowserToolResultView(result) : null;
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
    || browserView
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
    } else if (browserView) {
      resultBody = <BrowserToolResultView view={browserView} />;
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
  input,
}: {
  output: QkrpcToolResult;
  toolName: string;
  input?: unknown;
}) {
  if (parseDocsToolInlineResult(output)) {
    return <DocsToolOutputView output={output} />;
  }
  return (
    <ToolPayloadView
      label="结果"
      value={output}
      compact
      toolName={toolName}
      input={input}
      output={output}
    />
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
    const displayValue =
      toolName === BROWSER_TOOL ? redactBrowserBinaryFields(value) : value;
    return (
      <div className={`tool-section tool-section--raw-json${dense ? " tool-section--dense" : ""}`}>
        <div className="tool-section-label">
          <span>{label}</span>
        </div>
        <JsonBlock value={displayValue} followTail={followTail} />
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
