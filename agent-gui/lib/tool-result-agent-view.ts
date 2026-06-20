import {
  readActionTraceRef,
  type ActionTraceStepSummary,
} from "@/lib/action-trace-artifact";
import {
  countSearchMatchHits,
  normalizeGrepMatchesByPath,
} from "@/lib/search-match-grouping";
import {
  parseStepRunnerSearchResult,
  formatStepRunnerSearchMetaLine,
  buildStepRunnerGetInputFromSearchItem,
} from "@/lib/step-runner-tool";
import {
  applyAlwaysOnToolResultShape,
  shapeStepRunnerGetResult,
  STEP_RUNNER_GET_SCHEMA_SOFT_CHARS,
} from "@/lib/tool-result-always-shape";
import type { ToolNextAction } from "@/lib/tool-result";
import {
  formatTraceEventLine,
  parseActionTraceEvents,
  type ActionTraceEvent,
} from "@/lib/action-trace-format";
import {
  QKRPC_ACTION_DEBUG_TOOL,
  QKRPC_ACTION_GET_TOOL,
  QKRPC_ACTION_QUERY_TOOL,
} from "@/lib/qkrpc-action-tool";
import {
  GREP_TOOL,
  READ_TOOL,
  SHELL_TOOL,
  LEGACY_SHELL_EXEC_TOOL,
  STR_REPLACE_TOOL,
  WRITE_TOOL,
} from "@/lib/host-tool-constants";
import { DOCS_TOOL } from "@/lib/docs-tool";
import {
  QKRPC_SUBPROGRAM_GET_TOOL,
  QKRPC_SUBPROGRAM_QUERY_TOOL,
} from "@/lib/qkrpc-subprogram-tool";
import { WEB_SEARCH_TOOL } from "@/lib/web-search-tool-constants";
import { BROWSER_TOOL } from "@/lib/browser-tool-constants";
import { WORKSPACE_PROGRAM_TOOL } from "@/lib/workspace-program-tool";
import {
  attachToolFeedback,
  isStructuredToolResult,
  type StructuredToolResult,
  type ToolNextAction,
} from "@/lib/tool-result";

export const AGENT_PAYLOAD_SOFT_CHARS = 8_000;
export const AGENT_PAYLOAD_HARD_CHARS = 24_000;

/**
 * L1 per-tool payload shaping (truncate, omit fields, regroup matches).
 * Default **on** — full payloads kept in displayData when compressed.
 * Set TOOL_RESULT_AGENT_VIEW_COMPRESSION=0 to disable semantic compression.
 */
export function isToolResultAgentViewCompressionEnabled(): boolean {
  const raw = process.env.TOOL_RESULT_AGENT_VIEW_COMPRESSION?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  return true;
}

const SHELL_HEAD_LINES = 16;
const SHELL_TAIL_LINES = 32;
const WORKSPACE_CONTENT_PREVIEW_CHARS = 2_000;
const TRACE_WINDOW_BEFORE = 2;
const TRACE_WINDOW_AFTER = 3;
const DOCS_MARKDOWN_PREVIEW_CHARS = 1_500;
const DOCS_SEARCH_SNIPPET_MAX_CHARS = 400;
const DOCS_INDEX_TOPIC_DESC_MAX_CHARS = 120;
const DOCS_SEARCH_MAX_ITEMS = 10;
const GREP_MATCH_CONTENT_MAX_CHARS = 240;
const ACTION_QUERY_MAX_ITEMS = 40;
const ACTION_QUERY_DESC_MAX_CHARS = 120;
const ACTION_GET_MAX_STEP_SUMMARIES = 48;
const GENERIC_STRING_MAX_CHARS = 600;
const GENERIC_ARRAY_MAX_ITEMS = 40;
const WEB_SEARCH_MAX_RESULTS = 5;
const WEB_SEARCH_SNIPPET_MAX_CHARS = 220;
const BROWSER_TEXT_PREVIEW_HEAD = 1_500;
const BROWSER_TEXT_PREVIEW_TAIL = 500;
const BROWSER_LARGE_FIELDS = ["snapshot", "text", "html", "content", "result"] as const;
const SUBPROGRAM_QUERY_MAX_ITEMS = 40;
const FILE_MUTATION_CONTENT_PREVIEW_CHARS = 240;
const FILE_MUTATION_OMIT_THRESHOLD = 600;

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function estimateStructuredResultChars(result: StructuredToolResult): number {
  return JSON.stringify({
    ok: result.ok,
    exitCode: result.exitCode,
    data: result.data,
    stderr: result.stderr,
    summary: result.summary,
    truncated: result.truncated,
  }).length;
}

type CompressRefetch = {
  tool: string;
  reason: string;
  inputPatch: Record<string, unknown>;
};

function refetchToNextAction(refetch: CompressRefetch): ToolNextAction {
  return {
    tool: refetch.tool,
    reason: refetch.reason,
    input: refetch.inputPatch,
    priority: "recommended",
  };
}

function collapseTextHeadTail(
  text: string,
  headLines: number,
  tailLines: number,
): { text: string; omittedLines: number } {
  const lines = text.split(/\r?\n/);
  if (lines.length <= headLines + tailLines) {
    return { text, omittedLines: 0 };
  }
  const head = lines.slice(0, headLines);
  const tail = lines.slice(-tailLines);
  const omittedLines = lines.length - head.length - tail.length;
  return {
    text: [
      ...head,
      `…[${omittedLines} lines omitted]`,
      ...tail,
    ].join("\n"),
    omittedLines,
  };
}

function collapseTextByChars(
  text: string,
  headChars: number,
  tailChars: number,
): { text: string; omittedChars: number } {
  if (text.length <= headChars + tailChars + 64) {
    return { text, omittedChars: 0 };
  }
  const head = text.slice(0, headChars);
  const tail = text.slice(-tailChars);
  const omittedChars = text.length - head.length - tail.length;
  return {
    text: `${head}\n…[${omittedChars} chars omitted]\n${tail}`,
    omittedChars,
  };
}

function pickFailureLocationForAgent(
  location: Record<string, unknown>,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of [
    "dataJsonPath",
    "dataJsonPointer",
    "nodePath",
    "stepPath",
    "stepRunnerKey",
    "stepId",
    "startLine",
    "endLine",
    "locationSummary",
    "matchMethod",
    "read",
  ]) {
    if (key in location) picked[key] = location[key];
  }
  return picked;
}

function findTraceFailureIndex(events: ActionTraceEvent[]): number {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const kind = events[i]?.kind ?? "";
    if (kind === "error" || kind === "warning") return i;
  }
  return events.length > 0 ? events.length - 1 : -1;
}

function buildTraceWindow(events: ActionTraceEvent[], centerIndex: number): {
  centerIndex: number;
  before: number;
  after: number;
  lines: string[];
} {
  if (centerIndex < 0 || events.length === 0) {
    return { centerIndex: -1, before: 0, after: 0, lines: [] };
  }
  const start = Math.max(0, centerIndex - TRACE_WINDOW_BEFORE);
  const end = Math.min(events.length - 1, centerIndex + TRACE_WINDOW_AFTER);
  const slice = events.slice(start, end + 1);
  return {
    centerIndex,
    before: centerIndex - start,
    after: end - centerIndex,
    lines: slice.map((event) => formatTraceEventLine(event)),
  };
}

function readStepSummaries(value: unknown): ActionTraceStepSummary[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const summaries: ActionTraceStepSummary[] = [];
  for (const item of value) {
    const record = readRecord(item);
    if (!record) continue;
    const name = readString(record.name);
    if (!name) continue;
    summaries.push({
      name,
      ...(typeof record.elapsedMs === "number" && record.elapsedMs > 0
        ? { elapsedMs: record.elapsedMs }
        : {}),
      ...(readString(record.stepPath) ? { stepPath: readString(record.stepPath) } : {}),
    });
  }
  return summaries.length > 0 ? summaries : undefined;
}

function buildDebugDisplayData(
  data: Record<string, unknown>,
  actionId?: string,
): Record<string, unknown> {
  const traceRef = readActionTraceRef(data.traceRef);
  const stepSummaries = readStepSummaries(data.stepSummaries);
  const failureLocation = readRecord(data.failureLocation);
  const display: Record<string, unknown> = {
    ...(actionId ? { actionId } : {}),
    ok: data.ok,
    ...(typeof data.eventCount === "number" ? { eventCount: data.eventCount } : {}),
    ...(typeof data.durationMs === "number" ? { durationMs: data.durationMs } : {}),
    ...(traceRef ? { traceRef } : {}),
    ...(stepSummaries ? { stepSummaries } : {}),
    ...(failureLocation ? { failureLocation } : {}),
    ...(readString(data.errorMessage) ? { errorMessage: readString(data.errorMessage) } : {}),
    ...(readString(data.message) ? { message: readString(data.message) } : {}),
    ...(readString(data.editHint) ? { editHint: readString(data.editHint) } : {}),
    ...(readString(data.returnResult) ? { returnResult: readString(data.returnResult) } : {}),
    ...(readString(data.actionTitle) ? { actionTitle: readString(data.actionTitle) } : {}),
  };
  return display;
}

function compressDebugResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  const data = readRecord(result.data);
  if (!data) return result;

  const events = parseActionTraceEvents(data.events ?? data);
  const hasTrace = events.length > 0;
  const hasFailureMeta = Boolean(data.failureLocation || data.errorMessage || data.message);
  if (!hasTrace && !hasFailureMeta && result.ok) return result;

  const inputRecord = readRecord(input);
  const actionId = readString(inputRecord?.id);
  const eventCount =
    typeof data.eventCount === "number" ? data.eventCount : events.length;
  const durationMs =
    typeof data.durationMs === "number" ? data.durationMs : undefined;
  const traceRef = readActionTraceRef(data.traceRef);
  const stepSummaries = readStepSummaries(data.stepSummaries);

  const failureLocation = readRecord(data.failureLocation);
  const editHint = readString(data.editHint);
  const runOk = result.ok && data.ok !== false;

  const compressed: Record<string, unknown> = {
    ...(actionId ? { actionId } : {}),
    ok: data.ok ?? result.ok,
    eventCount,
    ...(durationMs != null ? { durationMs } : {}),
    ...(traceRef ? { traceRef } : {}),
    ...(stepSummaries ? { stepSummaries } : {}),
  };

  let agentSummary: string;
  let refetch: CompressRefetch | undefined;

  if (runOk) {
    compressed.outcome = "success";
    agentSummary = `debug ok · ${eventCount} events`
      + (durationMs != null ? ` · ${Math.round(durationMs)}ms` : "")
      + (traceRef ? ` · ${traceRef.path}` : "");
  } else {
    const failureIndex = findTraceFailureIndex(events);
    const traceWindow = buildTraceWindow(events, failureIndex);
    compressed.traceWindow = traceWindow;
    compressed.omittedEvents = Math.max(0, events.length - traceWindow.lines.length);
    if (failureLocation) {
      compressed.failureLocation = pickFailureLocationForAgent(failureLocation);
    }
    if (editHint) compressed.editHint = editHint;
    const err =
      readString(data.errorMessage)
      ?? readString(data.message)
      ?? readString(failureLocation?.locationSummary);
    if (err) compressed.errorMessage = err;
    const pointer = readString(failureLocation?.dataJsonPointer);
    agentSummary = pointer
      ? `debug failed at ${pointer} · ${eventCount} events`
      : `debug failed · ${eventCount} events`;
    if (traceRef) {
      agentSummary += ` · ${traceRef.path}`;
    } else {
      refetch = {
        tool: QKRPC_ACTION_DEBUG_TOOL,
        reason: "full_trace",
        inputPatch: {
          id: actionId,
          param: readString(inputRecord?.param),
          traceDetail: "full",
        },
      };
    }
  }

  const next: StructuredToolResult = {
    ...result,
    data: compressed,
    displayData: buildDebugDisplayData(
      { ...data, eventCount, durationMs },
      actionId,
    ),
    truncated: true,
    summary: agentSummary,
  };

  if (refetch) {
    return attachToolFeedback(next, {
      nextActions: [refetchToNextAction(refetch)],
    });
  }
  return next;
}

function compressShellResult(
  _input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  const data = readRecord(result.data);
  if (!data) return result;

  const output = readString(data.output);
  if (!output || output.length <= AGENT_PAYLOAD_SOFT_CHARS) return result;

  const collapsed = output.includes("\n")
    ? collapseTextHeadTail(output, SHELL_HEAD_LINES, SHELL_TAIL_LINES)
    : collapseTextByChars(output, 4_000, 2_000);
  const agentSummary = result.ok
    ? `shell exit ${result.exitCode} · ${output.length} chars output (compressed)`
    : `shell failed exit ${result.exitCode}`;

  const compressedData: Record<string, unknown> = {
    ...data,
    output: collapsed.text,
    truncated: true,
    totalOutputChars: output.length,
    omittedOutputLines: "omittedLines" in collapsed ? collapsed.omittedLines : undefined,
    omittedOutputChars: "omittedChars" in collapsed ? collapsed.omittedChars : undefined,
    readHint: "Output truncated for context — rerun a narrower command if needed.",
  };

  return {
    ...result,
    data: compressedData,
    displayData: data,
    truncated: true,
    summary: agentSummary,
  };
}

function withCompressedResult(
  result: StructuredToolResult,
  options: {
    data: Record<string, unknown>;
    displayData: unknown;
    agentSummary: string;
    refetch?: CompressRefetch;
  },
): StructuredToolResult {
  const next: StructuredToolResult = {
    ...result,
    data: options.data,
    displayData: options.displayData,
    truncated: true,
    summary: options.agentSummary,
  };
  if (!options.refetch) return next;
  return attachToolFeedback(next, {
    nextActions: [refetchToNextAction(options.refetch)],
  });
}

function compressLargeFileContent(
  input: unknown,
  result: StructuredToolResult,
  toolName: string,
  action: string,
): StructuredToolResult {
  const data = readRecord(result.data);
  if (!data || data.success === false) return result;

  const content = typeof data.content === "string" ? data.content : null;
  if (!content || content.length <= AGENT_PAYLOAD_SOFT_CHARS) return result;

  const inputRecord = readRecord(input);
  const preview = content.slice(0, WORKSPACE_CONTENT_PREVIEW_CHARS);
  const omitted = content.length - preview.length;
  const endLine =
    typeof data.endLine === "number"
      ? data.endLine
      : typeof data.startLine === "number"
        ? data.startLine + (typeof data.maxLines === "number" ? data.maxLines : 400)
        : undefined;

  const compressedData: Record<string, unknown> = {
    ...data,
    content: `${preview}\n…[${omitted} chars omitted]`,
    truncated: true,
    totalChars: typeof data.totalChars === "number" ? data.totalChars : content.length,
    readHint:
      readString(data.readHint)
      ?? `Use startLine/endLine on ${toolName} to read the next slice.`,
  };

  const path = readString(data.path) ?? "data.json";
  const agentSummary = `${action} ${path} · ${content.length} chars (preview ${preview.length})`;
  const refetch: CompressRefetch = {
    tool: toolName,
    reason: "pagination",
    inputPatch: {
      action: inputRecord?.action ?? action,
      target: inputRecord?.target,
      id: inputRecord?.id,
      subProgramId: inputRecord?.subProgramId,
      path: inputRecord?.path ?? data.path,
      startLine: endLine != null ? endLine + 1 : 1,
      maxLines: inputRecord?.maxLines ?? 400,
    },
  };

  return withCompressedResult(result, {
    data: compressedData,
    displayData: data,
    agentSummary,
    refetch,
  });
}

function compressWorkspaceProgramResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  const inputRecord = readRecord(input);
  const action = readString(inputRecord?.action);
  if (action !== "read_data" && action !== "file_read") return result;
  return compressLargeFileContent(input, result, WORKSPACE_PROGRAM_TOOL, action);
}

function compressReadToolResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  const inputRecord = readRecord(input);
  const action = readString(inputRecord?.action) ?? "read";
  if (action !== "read") return result;
  return compressLargeFileContent(input, result, READ_TOOL, "read");
}

function shrinkMutationContentField(
  text: string | undefined,
): { value: string | undefined; omittedChars: number } {
  if (!text || text.length <= FILE_MUTATION_OMIT_THRESHOLD) {
    return { value: text, omittedChars: 0 };
  }
  const preview = text.slice(0, FILE_MUTATION_CONTENT_PREVIEW_CHARS);
  return {
    value: `${preview}…[+${text.length - FILE_MUTATION_CONTENT_PREVIEW_CHARS} chars omitted — use Read for full file]`,
    omittedChars: text.length - FILE_MUTATION_CONTENT_PREVIEW_CHARS,
  };
}

function compressFileWriteResult(
  _input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  const data = readRecord(result.data);
  if (!data || data.success === false) return result;

  const action = readString(data.action);
  if (action !== "file-write") return result;

  const content = readString(data.content);
  const previousContent = readString(data.previousContent);
  const shrunkPrevious = shrinkMutationContentField(previousContent);

  if (content == null && shrunkPrevious.omittedChars === 0) return result;

  const compressedData: Record<string, unknown> = { ...data };
  delete compressedData.content;

  if (previousContent != null) {
    compressedData.previousContent = shrunkPrevious.value;
  }
  if (shrunkPrevious.omittedChars > 0) {
    compressedData.truncated = true;
    compressedData.readHint =
      "Previous file content truncated — use Read with startLine/endLine if needed.";
  }

  const path = readString(data.path) ?? "?";
  const bytesWritten =
    typeof data.bytesWritten === "number" ? data.bytesWritten : undefined;
  const agentSummary = `Write ${path}`
    + (bytesWritten != null ? ` · ${bytesWritten} bytes` : "")
    + (content != null ? " · written content omitted from agent view" : "")
    + (shrunkPrevious.omittedChars > 0
      ? ` · ${shrunkPrevious.omittedChars}+ chars of previous omitted`
      : "");

  return withCompressedResult(result, {
    data: compressedData,
    displayData: data,
    agentSummary,
  });
}

function compressFileEditResult(
  _input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  const data = readRecord(result.data);
  if (!data || data.success === false) return result;

  const action = readString(data.action);
  if (action !== "file-edit") return result;

  const content = readString(data.content);
  const previousContent = readString(data.previousContent);
  const needsCompress =
    estimateStructuredResultChars(result) > AGENT_PAYLOAD_SOFT_CHARS
    || (content != null && content.length > FILE_MUTATION_OMIT_THRESHOLD)
    || (previousContent != null && previousContent.length > FILE_MUTATION_OMIT_THRESHOLD);
  if (!needsCompress) return result;

  const shrunkContent = shrinkMutationContentField(content);
  const shrunkPrevious = shrinkMutationContentField(previousContent);
  const totalOmitted = shrunkContent.omittedChars + shrunkPrevious.omittedChars;

  const compressedData: Record<string, unknown> = {
    ...data,
    ...(content != null ? { content: shrunkContent.value } : {}),
    ...(previousContent != null ? { previousContent: shrunkPrevious.value } : {}),
    truncated: totalOmitted > 0 || undefined,
    readHint: "Full file content omitted from agent view — use Read with startLine/endLine if needed.",
  };

  const path = readString(data.path) ?? "?";
  const agentSummary = `StrReplace ${path}`
    + (totalOmitted > 0 ? ` · ${totalOmitted}+ chars omitted from payload` : "");

  return withCompressedResult(result, {
    data: compressedData,
    displayData: data,
    agentSummary,
  });
}

function compressWriteToolResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  return compressFileWriteResult(input, result);
}

function compressStrReplaceToolResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  return compressFileEditResult(input, result);
}

function slimGrepHit(row: Record<string, unknown>): Record<string, unknown> {
  const content = readString(row.content) ?? readString(row.lineText);
  if (!content || content.length <= GREP_MATCH_CONTENT_MAX_CHARS) return row;
  const key = row.content != null ? "content" : "lineText";
  return {
    ...row,
    [key]: `${content.slice(0, GREP_MATCH_CONTENT_MAX_CHARS)}…`,
  };
}

function slimGrepMatches(matches: unknown[]): unknown[] {
  return matches.map((match) => {
    const row = readRecord(match);
    if (!row) return match;
    if (Array.isArray(row.hits)) {
      return {
        path: row.path,
        hits: row.hits.map((hit) => {
          const hitRow = readRecord(hit);
          return hitRow ? slimGrepHit(hitRow) : hit;
        }),
      };
    }
    return slimGrepHit(row);
  });
}

function formatGrepAgentSummary(
  pattern: string,
  matchHitCount: number,
  totalMatches: number,
  pathCount: number,
): string {
  const patternLabel = pattern || "?";
  const filesPart = pathCount > 0 ? ` · ${pathCount} files` : "";
  if (totalMatches > matchHitCount) {
    return `grep ${patternLabel} · ${matchHitCount}/${totalMatches} line hits returned${filesPart}`;
  }
  return `grep ${patternLabel} · ${matchHitCount} line hits${filesPart}`;
}

function compressGrepResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  const data = readRecord(result.data);
  if (!data || data.success === false || !Array.isArray(data.matches)) return result;

  const inputRecord = readRecord(input);
  const rawMatches = data.matches as unknown[];
  const normalizedMatches = normalizeGrepMatchesByPath(rawMatches);
  const slimMatches = slimGrepMatches(normalizedMatches);
  const matchesPayloadChanged =
    JSON.stringify(slimMatches) !== JSON.stringify(rawMatches);
  const overBudget = estimateStructuredResultChars(result) > AGENT_PAYLOAD_SOFT_CHARS;
  const contentSlimmed =
    JSON.stringify(slimMatches) !== JSON.stringify(normalizedMatches);

  if (!matchesPayloadChanged) return result;

  if (!overBudget && !contentSlimmed) {
    return {
      ...result,
      data: { ...data, matches: slimMatches },
    };
  }

  const compressedData: Record<string, unknown> = {
    ...data,
    matches: slimMatches,
    truncated: true,
    readHint: readString(data.hint)
      ?? "Increase head_limit or offset for more grep matches.",
  };

  const matchHitCount = countSearchMatchHits(slimMatches);
  const totalMatches =
    typeof data.totalMatches === "number" ? data.totalMatches : matchHitCount;
  const agentSummary = formatGrepAgentSummary(
    readString(data.pattern) ?? "?",
    matchHitCount,
    totalMatches,
    slimMatches.length,
  );

  const refetch: CompressRefetch | undefined =
    data.truncated === true || matchHitCount < totalMatches
      ? {
          tool: GREP_TOOL,
          reason: "pagination",
          inputPatch: {
            ...inputRecord,
            offset: (typeof inputRecord?.offset === "number" ? inputRecord.offset : 0)
              + matchHitCount,
          },
        }
      : undefined;

  return withCompressedResult(result, {
    data: compressedData,
    displayData: data,
    agentSummary,
    refetch,
  });
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

function compressDocsResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  const data = readRecord(result.data);
  if (!data || data.success === false) return result;
  if (estimateStructuredResultChars(result) <= AGENT_PAYLOAD_SOFT_CHARS) return result;

  const docsAction = readString(data.docsAction) ?? readString(data.action);
  const inputRecord = readRecord(input);

  if (docsAction === "get" && data.mode === "full") {
    const markdown = readString(data.markdown);
    if (!markdown || markdown.length <= DOCS_MARKDOWN_PREVIEW_CHARS) return result;
    const compressedData: Record<string, unknown> = {
      ...data,
      markdown: truncateText(markdown, DOCS_MARKDOWN_PREVIEW_CHARS),
      truncated: true,
      readHint: "Use docs get with section=… for a focused snippet.",
    };
    const topic = readString(data.topic) ?? "?";
    return withCompressedResult(result, {
      data: compressedData,
      displayData: data,
      agentSummary: `docs get ${topic} · ${markdown.length} chars (preview)`,
      refetch: {
        tool: DOCS_TOOL,
        reason: "detail_mode",
        inputPatch: {
          action: "get",
          topic: data.topic,
          section: inputRecord?.section,
        },
      },
    });
  }

  if (docsAction === "search" && Array.isArray(data.items)) {
    const items = data.items as unknown[];
    const slimItems = items.slice(0, DOCS_SEARCH_MAX_ITEMS).map((item) => {
      const row = readRecord(item);
      if (!row) return item;
      const snippet = readString(row.snippet);
      if (!snippet) return row;
      return {
        ...row,
        snippet: truncateText(snippet, DOCS_SEARCH_SNIPPET_MAX_CHARS),
      };
    });
    const compressedData: Record<string, unknown> = {
      ...data,
      items: slimItems,
      truncated: items.length > DOCS_SEARCH_MAX_ITEMS || undefined,
      omittedItems: items.length > slimItems.length
        ? items.length - slimItems.length
        : undefined,
    };
    return withCompressedResult(result, {
      data: compressedData,
      displayData: data,
      agentSummary: `docs search · ${slimItems.length}/${items.length} items`,
    });
  }

  if (docsAction === "index" && Array.isArray(data.topics)) {
    const topics = data.topics as unknown[];
    const slimTopics = topics.map((topic) => {
      const row = readRecord(topic);
      if (!row) return topic;
      const description = readString(row.description);
      if (!description) return row;
      return {
        ...row,
        description: truncateText(description, DOCS_INDEX_TOPIC_DESC_MAX_CHARS),
      };
    });
    const compressedData: Record<string, unknown> = { ...data, topics: slimTopics };
    return withCompressedResult(result, {
      data: compressedData,
      displayData: data,
      agentSummary: `docs index · ${topics.length} topics`,
    });
  }

  return result;
}

function unwrapQkrpcPayload(data: Record<string, unknown>): Record<string, unknown> {
  const payload = readRecord(data.payload);
  return payload ?? data;
}

function summarizeStepsForAgent(steps: unknown[]): Record<string, unknown>[] {
  const summaries: Record<string, unknown>[] = [];
  for (let i = 0; i < steps.length && i < ACTION_GET_MAX_STEP_SUMMARIES; i += 1) {
    const step = readRecord(steps[i]);
    if (!step) continue;
    summaries.push({
      stepRunnerKey: step.stepRunnerKey,
      note: step.note,
      stepId: step.stepId,
    });
  }
  return summaries;
}

function extractStepsFromPayload(payload: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(payload.steps)) return payload.steps;
  const compressed = readRecord(payload.compressed);
  if (compressed && Array.isArray(compressed.steps)) return compressed.steps;
  return null;
}

function compressProgramGetResult(
  input: unknown,
  result: StructuredToolResult,
  refetchTool: string,
): StructuredToolResult {
  if (estimateStructuredResultChars(result) <= AGENT_PAYLOAD_SOFT_CHARS) return result;

  const data = readRecord(result.data);
  if (!data) return result;

  const payload = unwrapQkrpcPayload(data);
  const steps = extractStepsFromPayload(payload);
  if (!steps || steps.length === 0) return result;

  const inputRecord = readRecord(input);
  const programId =
    readString(payload.actionId)
    ?? readString(payload.subProgramId)
    ?? readString(payload.id)
    ?? readString(inputRecord?.id);

  const stepSummaries = summarizeStepsForAgent(steps);
  const compressedPayload: Record<string, unknown> = {
    actionId: payload.actionId,
    subProgramId: payload.subProgramId ?? payload.id,
    title: payload.title,
    name: payload.name,
    editVersion: payload.editVersion,
    workspaceSynced: payload.workspaceSynced,
    workspaceProject: payload.workspaceProject,
    workspaceSyncNote: payload.workspaceSyncNote,
    stepCount: steps.length,
    stepSummaries,
    omittedSteps: Math.max(0, steps.length - stepSummaries.length),
    readHint: "Use workspace_program read_data/edit_data for program body edits.",
  };
  if (payload.variables != null) {
    compressedPayload.variableCount = Array.isArray(payload.variables)
      ? payload.variables.length
      : undefined;
  }

  const compressedData: Record<string, unknown> = {
    ...data,
    payload: compressedPayload,
  };
  delete compressedData.compressed;

  const label = refetchTool.includes("subprogram") ? "subprogram get" : "action get";
  const agentSummary = `${label} ${programId ?? "?"} · ${steps.length} steps (summary)`;
  const anchors: Record<string, string> = {};
  if (programId) {
    anchors.actionId = programId;
    if (payload.subProgramId) anchors.subProgramId = String(payload.subProgramId);
  }

  return withCompressedResult(result, {
    data: compressedData,
    displayData: data,
    agentSummary,
    anchors,
    refetch: {
      tool: refetchTool,
      reason: "detail_mode",
      inputPatch: {
        id: programId,
        returnMode: "structure",
      },
    },
  });
}

function compressActionGetResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  return compressProgramGetResult(input, result, QKRPC_ACTION_GET_TOOL);
}

function compressSubprogramGetResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  return compressProgramGetResult(input, result, QKRPC_SUBPROGRAM_GET_TOOL);
}

function compressSubprogramQueryResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  if (estimateStructuredResultChars(result) <= AGENT_PAYLOAD_SOFT_CHARS) return result;

  const data = readRecord(result.data);
  if (!data) return result;

  const payload = unwrapQkrpcPayload(data);
  const rawItems = Array.isArray(payload.items) ? payload.items : null;
  if (!rawItems || rawItems.length === 0) return result;

  const slimItems = rawItems
    .slice(0, SUBPROGRAM_QUERY_MAX_ITEMS)
    .map((item) => {
      const row = readRecord(item);
      if (!row) return null;
      const id = readString(row.subProgramId) ?? readString(row.id);
      if (!id) return null;
      const description = readString(row.description);
      return {
        subProgramId: id,
        name: row.name ?? row.title,
        description: description
          ? truncateText(description, ACTION_QUERY_DESC_MAX_CHARS)
          : undefined,
      };
    })
    .filter((item): item is Record<string, unknown> => item != null);

  const compressedPayload: Record<string, unknown> = {
    ...payload,
    items: slimItems,
    matchCount:
      typeof payload.matchCount === "number" ? payload.matchCount : rawItems.length,
    returnedCount: slimItems.length,
    omittedItems: Math.max(0, rawItems.length - slimItems.length),
  };

  const compressedData: Record<string, unknown> = {
    ...data,
    payload: compressedPayload,
  };

  const query = readString(readRecord(input)?.query);
  const agentSummary = query
    ? `subprogram query "${truncateText(query, 48)}" · ${slimItems.length}/${rawItems.length}`
    : `subprogram query · ${slimItems.length}/${rawItems.length} items`;

  return withCompressedResult(result, {
    data: compressedData,
    displayData: data,
    agentSummary,
  });
}

function compressWebSearchResult(
  _input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  const data = readRecord(result.data);
  if (!data || data.success === false || !Array.isArray(data.results)) return result;

  const results = data.results as unknown[];
  const needsSlim =
    results.length > WEB_SEARCH_MAX_RESULTS
    || estimateStructuredResultChars(result) > AGENT_PAYLOAD_SOFT_CHARS
    || results.some((item) => {
      const snippet = readString(readRecord(item)?.snippet);
      return snippet != null && snippet.length > WEB_SEARCH_SNIPPET_MAX_CHARS;
    });
  if (!needsSlim) return result;
  const slimResults = results.slice(0, WEB_SEARCH_MAX_RESULTS).map((item) => {
    const row = readRecord(item);
    if (!row) return item;
    const snippet = readString(row.snippet);
    return {
      title: row.title,
      url: row.url,
      snippet: snippet
        ? truncateText(snippet, WEB_SEARCH_SNIPPET_MAX_CHARS)
        : undefined,
    };
  });

  const compressedData: Record<string, unknown> = {
    ...data,
    results: slimResults,
    truncated: results.length > slimResults.length || undefined,
    omittedResults: Math.max(0, results.length - slimResults.length),
    readHint: "Increase limit or refine query for more web results.",
  };

  const query = readString(data.query) ?? "?";
  return withCompressedResult(result, {
    data: compressedData,
    displayData: data,
    agentSummary: `web_search "${truncateText(query, 40)}" · ${slimResults.length}/${results.length} results`,
  });
}

function compressBrowserResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  const data = readRecord(result.data);
  if (!data) return result;

  let needsCompress = estimateStructuredResultChars(result) > AGENT_PAYLOAD_SOFT_CHARS;
  if (!needsCompress) {
    for (const key of BROWSER_LARGE_FIELDS) {
      const text = readString(data[key]);
      if (text && text.length > AGENT_PAYLOAD_SOFT_CHARS) {
        needsCompress = true;
        break;
      }
    }
  }
  if (!needsCompress) return result;

  const compressedData: Record<string, unknown> = { ...data };
  let omittedChars = 0;
  for (const key of BROWSER_LARGE_FIELDS) {
    const text = readString(data[key]);
    if (!text || text.length <= AGENT_PAYLOAD_SOFT_CHARS) continue;
    const collapsed = text.includes("\n")
      ? collapseTextHeadTail(text, 24, 16)
      : collapseTextByChars(text, BROWSER_TEXT_PREVIEW_HEAD, BROWSER_TEXT_PREVIEW_TAIL);
    compressedData[key] = collapsed.text;
    omittedChars += "omittedChars" in collapsed
      ? collapsed.omittedChars
      : collapsed.omittedLines * 40;
  }

  compressedData.truncated = true;
  compressedData.readHint =
    "Browser payload truncated — use snapshot/content with narrower scope or evaluate a smaller script.";

  const inputRecord = readRecord(input);
  const action = readString(inputRecord?.action) ?? readString(data.action) ?? "browser";
  const agentSummary = `browser ${action}`
    + (omittedChars > 0 ? ` · ${omittedChars}+ chars omitted` : " · compressed");

  return withCompressedResult(result, {
    data: compressedData,
    displayData: data,
    agentSummary,
  });
}

function slimActionQueryItem(raw: unknown): Record<string, unknown> | null {
  const row = readRecord(raw);
  if (!row) return null;
  const id = readString(row.actionId) ?? readString(row.id);
  if (!id) return null;
  const description = readString(row.description);
  return {
    actionId: id,
    title: row.title,
    description: description
      ? truncateText(description, ACTION_QUERY_DESC_MAX_CHARS)
      : undefined,
    profileName: row.profileName,
    lastEditTimeLocal: row.lastEditTimeLocal,
  };
}

function compressActionQueryResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  if (estimateStructuredResultChars(result) <= AGENT_PAYLOAD_SOFT_CHARS) return result;

  const data = readRecord(result.data);
  if (!data) return result;

  const payload = unwrapQkrpcPayload(data);
  const rawItems = Array.isArray(payload.items) ? payload.items : null;
  if (!rawItems || rawItems.length === 0) return result;

  const slimItems = rawItems
    .slice(0, ACTION_QUERY_MAX_ITEMS)
    .map((item) => slimActionQueryItem(item))
    .filter((item): item is Record<string, unknown> => item != null);

  const compressedPayload: Record<string, unknown> = {
    ...payload,
    items: slimItems,
    matchCount:
      typeof payload.matchCount === "number" ? payload.matchCount : rawItems.length,
    returnedCount: slimItems.length,
    omittedItems: Math.max(0, rawItems.length - slimItems.length),
  };

  const compressedData: Record<string, unknown> = {
    ...data,
    payload: compressedPayload,
  };

  const query = readString(readRecord(input)?.query);
  const agentSummary = query
    ? `action query "${truncateText(query, 48)}" · ${slimItems.length}/${rawItems.length}`
    : `action query · ${slimItems.length}/${rawItems.length} actions`;

  const refetch: CompressRefetch | undefined =
    rawItems.length > slimItems.length
      ? {
          tool: QKRPC_ACTION_QUERY_TOOL,
          reason: "pagination",
          inputPatch: {
            ...readRecord(input),
            limit: Math.min(ACTION_QUERY_MAX_ITEMS, rawItems.length),
          },
        }
      : undefined;

  return withCompressedResult(result, {
    data: compressedData,
    displayData: data,
    agentSummary,
    refetch,
  });
}

function shrinkValueForAgent(value: unknown, depth = 0): unknown {
  if (depth > 10) return "[nested limit]";
  if (typeof value === "string") {
    if (value.length <= GENERIC_STRING_MAX_CHARS) return value;
    return `${value.slice(0, GENERIC_STRING_MAX_CHARS)}…[+${value.length - GENERIC_STRING_MAX_CHARS} chars]`;
  }
  if (Array.isArray(value)) {
    const slice = value
      .slice(0, GENERIC_ARRAY_MAX_ITEMS)
      .map((item) => shrinkValueForAgent(item, depth + 1));
    if (value.length > GENERIC_ARRAY_MAX_ITEMS) {
      slice.push(`…[+${value.length - GENERIC_ARRAY_MAX_ITEMS} items]`);
    }
    return slice;
  }
  if (value != null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = shrinkValueForAgent(nested, depth + 1);
    }
    return out;
  }
  return value;
}

function compressGenericQkrpcResult(
  _input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  if (result.source !== "qkrpc" || result.displayData != null) return result;
  if (estimateStructuredResultChars(result) <= AGENT_PAYLOAD_SOFT_CHARS) return result;

  const data = result.data;
  const shrunk = shrinkValueForAgent(data);
  const agentSummary =
    result.summary
    ?? (result.ok ? "qkrpc ok (payload compressed)" : "qkrpc failed (payload compressed)");

  return withCompressedResult(result, {
    data: shrunk as Record<string, unknown>,
    displayData: data,
    agentSummary,
  });
}

function applyGlobalBudget(
  result: StructuredToolResult,
): StructuredToolResult {
  const chars = estimateStructuredResultChars(result);
  if (chars <= AGENT_PAYLOAD_HARD_CHARS) return result;

  const data = readRecord(result.data);
  const summary =
    result.summary
    ?? (result.ok ? "ok" : "failed");

  const compactData: Record<string, unknown> = {
    ok: result.ok,
    ...(data?.actionId != null ? { actionId: data.actionId } : {}),
    ...(data?.path != null ? { path: data.path } : {}),
    errorMessage:
      readString(data?.errorMessage)
      ?? readString(data?.message)
      ?? result.stderr,
    agentPayload: "summary_only",
    summary,
    originalChars: chars,
    readHint:
      readString(data?.readHint)
      ?? (result.nextActions?.length
        ? "See nextActions on this tool result for continuation parameters."
        : "Repeat the tool with narrower parameters."),
  };

  const displayData = result.displayData ?? data ?? result.data;

  return {
    ...result,
    data: compactData,
    displayData,
    truncated: true,
    summary,
  };
}

type ToolResultCompressor = (
  input: unknown,
  result: StructuredToolResult,
) => StructuredToolResult;

function buildStepRunnerSearchNextActions(
  parsed: NonNullable<ReturnType<typeof parseStepRunnerSearchResult>>,
): ToolNextAction[] | undefined {
  const top = parsed.items[0];
  if (!top) return undefined;
  return [{
    tool: "qkrpc_step_runner_get",
    reason: "Fetch compressed schema for the top search hit before editing steps.",
    input: buildStepRunnerGetInputFromSearchItem(top),
    priority: "required",
  }];
}

function compressStepRunnerSearchResult(
  input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  const parsed = parseStepRunnerSearchResult(result.data, input);
  const nextActions = parsed ? buildStepRunnerSearchNextActions(parsed) : undefined;

  if (estimateStructuredResultChars(result) <= AGENT_PAYLOAD_SOFT_CHARS) {
    if (!nextActions?.length) return result;
    return attachToolFeedback(result, { nextActions });
  }
  if (!parsed) return result;

  const data = readRecord(result.data);
  if (!data) return result;
  const payload = unwrapQkrpcPayload(data);
  const agentSummary = formatStepRunnerSearchMetaLine(parsed, {
    items: parsed.items,
    controlFieldItemCount: parsed.controlFieldItemCount,
    multiControlFieldCount: parsed.multiControlFieldCount,
  });

  const compressedPayload: Record<string, unknown> = {
    query: parsed.query,
    matchCount: parsed.matchCount,
    items: parsed.items,
    controlFieldItemCount: parsed.controlFieldItemCount,
    multiControlFieldCount: parsed.multiControlFieldCount,
    readHint: "Use items[].key (+ controlField.value) with qkrpc_step_runner_get.",
  };

  const compressedData: Record<string, unknown> = readRecord(data.payload)
    ? { ...data, payload: compressedPayload }
    : { ...data, ...compressedPayload };

  return withCompressedResult(
    nextActions?.length
      ? attachToolFeedback(result, { nextActions })
      : result,
    {
      data: compressedData,
      displayData: data,
      agentSummary,
    },
  );
}

function compressStepRunnerGetResult(
  _input: unknown,
  result: StructuredToolResult,
): StructuredToolResult {
  const data = readRecord(result.data);
  if (!data) return result;

  const payload = unwrapQkrpcPayload(data);
  const schemaJson = readString(payload.schemaJson) ?? readString(payload.SchemaJson);
  const overBudget =
    estimateStructuredResultChars(result) > AGENT_PAYLOAD_SOFT_CHARS
    || (schemaJson?.length ?? 0) > STEP_RUNNER_GET_SCHEMA_SOFT_CHARS;

  if (!overBudget) return result;

  const shaped = shapeStepRunnerGetResult(result);
  const key =
    readString(payload.key)
    ?? readString(payload.Key)
    ?? readString(readRecord(_input)?.key);

  return withCompressedResult(shaped, {
    data: shaped.data as Record<string, unknown>,
    displayData: data,
    agentSummary: key
      ? `step_runner_get ${key} · schema compressed`
      : "step_runner_get · schema compressed",
    refetch: key
      ? {
          tool: "qkrpc_step_runner_get",
          reason: "full_schema",
          inputPatch: { key },
        }
      : undefined,
  });
}

function resolveCompressor(toolName: string): ToolResultCompressor | null {
  if (toolName === QKRPC_ACTION_DEBUG_TOOL) {
    return compressDebugResult;
  }
  if (toolName === QKRPC_ACTION_GET_TOOL) {
    return compressActionGetResult;
  }
  if (toolName === QKRPC_SUBPROGRAM_GET_TOOL) {
    return compressSubprogramGetResult;
  }
  if (toolName === QKRPC_ACTION_QUERY_TOOL || toolName === "qkrpc_action_list") {
    return compressActionQueryResult;
  }
  if (
    toolName === QKRPC_SUBPROGRAM_QUERY_TOOL
    || toolName === "qkrpc_subprogram_list"
    || toolName === "qkrpc_subprogram_search"
  ) {
    return compressSubprogramQueryResult;
  }
  if (toolName === SHELL_TOOL || toolName === LEGACY_SHELL_EXEC_TOOL) {
    return compressShellResult;
  }
  if (toolName === WORKSPACE_PROGRAM_TOOL) {
    return compressWorkspaceProgramResult;
  }
  if (toolName === READ_TOOL) {
    return compressReadToolResult;
  }
  if (toolName === WRITE_TOOL) {
    return compressWriteToolResult;
  }
  if (toolName === STR_REPLACE_TOOL) {
    return compressStrReplaceToolResult;
  }
  if (toolName === GREP_TOOL) {
    return compressGrepResult;
  }
  if (toolName === DOCS_TOOL) {
    return compressDocsResult;
  }
  if (toolName === WEB_SEARCH_TOOL) {
    return compressWebSearchResult;
  }
  if (toolName === BROWSER_TOOL) {
    return compressBrowserResult;
  }
  if (toolName === "qkrpc_step_runner_search") {
    return compressStepRunnerSearchResult;
  }
  if (toolName === "qkrpc_step_runner_get") {
    return compressStepRunnerGetResult;
  }
  return null;
}

/** Apply per-tool semantic compression before the result enters chat history. */
export function formatToolResultForAgent(
  toolName: string,
  input: unknown,
  result: Record<string, unknown>,
): Record<string, unknown> {
  if (!isStructuredToolResult(result)) return result;

  let next = applyAlwaysOnToolResultShape(toolName, input, result);
  if (!isStructuredToolResult(next)) return next;

  if (!isToolResultAgentViewCompressionEnabled()) return next;

  const compressor = resolveCompressor(toolName);
  next = compressor ? compressor(input, next) : next;
  if (
    next.source === "qkrpc"
    && next.displayData == null
    && estimateStructuredResultChars(next) > AGENT_PAYLOAD_SOFT_CHARS
  ) {
    next = compressGenericQkrpcResult(input, next);
  }
  return applyGlobalBudget(next);
}

/** Extract compact placeholder fields from a structured tool result. */
export function buildMicrocompactPayload(
  output: Record<string, unknown>,
): Record<string, unknown> {
  const compact: Record<string, unknown> = {
    compact: true,
    note: "[compact: large tool output omitted; see recent turns]",
    ok: output.ok,
    exitCode: output.exitCode,
    truncated: output.truncated,
  };

  if (typeof output.summary === "string") {
    compact.summary = output.summary;
  }

  for (const key of ["actionId", "path", "action", "errorMessage", "dataJsonPointer"]) {
    if (key in output && !(key in compact)) compact[key] = output[key];
  }

  const data = readRecord(output.data);
  if (data) {
    if (data.actionId != null && compact.actionId == null) {
      compact.actionId = data.actionId;
    }
    if (data.path != null && compact.path == null) compact.path = data.path;
    if (readString(data.readHint)) compact.readHint = readString(data.readHint);
    const loc = readRecord(data.failureLocation);
    const pointer = readString(loc?.dataJsonPointer);
    if (pointer && compact.dataJsonPointer == null) {
      compact.dataJsonPointer = pointer;
    }
    const traceRef = readActionTraceRef(data.traceRef);
    if (traceRef && compact.tracePath == null) compact.tracePath = traceRef.path;
  }

  return compact;
}

/** @deprecated Use buildMicrocompactPayload */
export function buildMicrocompactPayloadFromAgentView(
  output: Record<string, unknown>,
): Record<string, unknown> {
  return buildMicrocompactPayload(output);
}
