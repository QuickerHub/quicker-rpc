"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import {
  isActionListTool,
  parseActionListFromQkrpcData,
  formatActionListMetaLine,
} from "@/lib/action-list";
import { parseSearchActionSummaries } from "@/lib/agent-api";
import {
  isDocsTool,
  summarizeDocsToolOutput,
} from "@/lib/docs-tool";
import { isStructuredToolResult } from "@/lib/tool-result";
import { ActionListView } from "./ActionListView";

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
): string | null {
  if (!isQkrpcToolResult(output)) return null;

  if (isDocsTool(toolName)) {
    const docSummary = summarizeDocsToolOutput(toolName, output);
    if (docSummary) return docSummary;
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
    if (isActionListTool(toolName)) {
      const list = parseActionListFromQkrpcData(toolName, output.data);
      if (list) return formatActionListMetaLine(list.meta);
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
export function formatToolDisplayName(toolName: string): string {
  return toolName.replace(/^qkrpc_/, "").replace(/_/g, " ");
}

export function buildToolSummaryMeta(
  state: string,
  summary: string | null,
): string {
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

function JsonBlock({
  value,
  followTail = false,
}: {
  value: unknown;
  followTail?: boolean;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const text =
    typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2) ?? String(value);

  useLayoutEffect(() => {
    if (!followTail) return;
    const el = preRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [text, followTail]);

  return (
    <pre ref={preRef} className="tool-json">
      {text}
    </pre>
  );
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
  return !isShallowPrimitiveData(result.data);
}

function CompactSuccessBody({ data }: { data: Record<string, unknown> }) {
  const message =
    typeof data.message === "string" ? data.message.trim() : "";
  const actionId =
    typeof data.actionId === "string" ? data.actionId.trim() : "";

  if (!message && !actionId) {
    return <ShallowObjectView data={data} />;
  }

  return (
    <div className="tool-compact-success">
      {message ? <p className="tool-plain-result">{message}</p> : null}
      {actionId ? (
        <p className="tool-plain-meta">
          <span className="tool-muted">ID</span>{" "}
          <code>{actionId}</code>
        </p>
      ) : null}
    </div>
  );
}

function KeyValueRows({
  entries,
}: {
  entries: Array<{ key: string; value: ReactNode }>;
}) {
  return (
    <dl className="tool-kv">
      {entries.map(({ key, value }) => (
        <div key={key} className="tool-kv-row">
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function renderValueCell(v: unknown): ReactNode {
  if (v === null || v === undefined) {
    return <span className="tool-muted">—</span>;
  }
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  if (typeof v === "object") {
    return (
      <pre className="tool-json tool-json--inline" tabIndex={0}>
        {JSON.stringify(v, null, 2)}
      </pre>
    );
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
      value: renderValueCell(value),
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

function QkrpcToolResultView({
  result,
  compact,
  toolName,
  followTail = false,
}: {
  result: QkrpcToolResult;
  compact?: boolean;
  toolName?: string;
  followTail?: boolean;
}) {
  const data = result.data;
  const actionList =
    result.ok && toolName
      ? parseActionListFromQkrpcData(toolName, data)
      : null;
  const hasRichBody = Boolean(actionList);

  let resultBody: ReactNode = null;
  if (data !== undefined && data !== null) {
    if (actionList) {
      resultBody = (
        <ActionListView meta={actionList.meta} items={actionList.items} />
      );
    } else if (
      typeof data === "object"
      && data !== null
      && !Array.isArray(data)
      && (data as Record<string, unknown>).action === "ping"
    ) {
      resultBody = <PingDataView data={data as Record<string, unknown>} />;
    } else if (
      compact
      && result.ok
      && typeof data === "object"
      && data !== null
      && !Array.isArray(data)
      && isShallowPrimitiveData(data)
      && (typeof (data as Record<string, unknown>).message === "string"
        || typeof (data as Record<string, unknown>).actionId === "string")
    ) {
      resultBody = (
        <CompactSuccessBody data={data as Record<string, unknown>} />
      );
    } else if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      resultBody = (
        <ShallowObjectView
          data={data as Record<string, unknown>}
          followTail={followTail}
        />
      );
    } else {
      resultBody = <JsonBlock value={data} followTail={followTail} />;
    }
  }

  const showRawJson = shouldShowRawJsonDetails(result, hasRichBody);

  return (
    <div className="tool-result">
      {!compact && (
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
    <details className="tool-raw-json">
      <summary>原始 JSON（调试）</summary>
      <JsonBlock value={value} />
    </details>
  );
}

/** Collapsed request + raw response for action-list tools. */
export function ToolMoreDetails({
  input,
  output,
}: {
  input?: unknown;
  output: unknown;
}) {
  const hasInput =
    input !== undefined
    && typeof input === "object"
    && input !== null
    && !Array.isArray(input)
    && Object.keys(input as object).length > 0;

  return (
    <details className="tool-more">
      <summary className="tool-more-summary">请求 / 原始数据</summary>
      <div className="tool-more-body">
        {hasInput && (
          <div className="tool-more-block">
            <span className="tool-more-label">请求</span>
            <JsonBlock value={input} />
          </div>
        )}
        <div className="tool-more-block">
          <span className="tool-more-label">响应</span>
          <JsonBlock value={output} />
        </div>
      </div>
    </details>
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
  const list = parseActionListFromQkrpcData(toolName, output.data);
  if (!output.ok || !list) {
    return (
      <ToolPayloadView label="结果" value={output} compact toolName={toolName} />
    );
  }

  return (
    <>
      <ActionListView meta={list.meta} items={list.items} showMeta={false} />
      <ToolMoreDetails input={input} output={output} />
    </>
  );
}

export function DocsToolBody({
  input,
  output,
  toolName,
}: {
  input?: unknown;
  output: QkrpcToolResult;
  toolName: string;
}) {
  return (
    <>
      <ToolPayloadView label="结果" value={output} compact toolName={toolName} />
      <ToolMoreDetails input={input} output={output} />
    </>
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
  toolName,
  followTail = false,
}: {
  label: string;
  value: unknown;
  compact?: boolean;
  toolName?: string;
  followTail?: boolean;
}) {
  if (value === undefined) return null;

  const emptyObject =
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value as object).length === 0;

  if (emptyObject) return null;

  const payloadInline = unwrapSinglePayloadField(value);
  const displayValue = payloadInline?.value ?? value;

  return (
    <div className="tool-section">
      <div className="tool-section-label">
        <span>{label}</span>
        {payloadInline && (
          <span className="tool-section-label-key">{payloadInline.fieldKey}</span>
        )}
      </div>
      {isQkrpcToolResult(displayValue) ? (
        <QkrpcToolResultView
          result={displayValue}
          compact={compact}
          toolName={toolName}
          followTail={followTail}
        />
      ) : (
        <JsonBlock value={displayValue} followTail={followTail} />
      )}
    </div>
  );
}
