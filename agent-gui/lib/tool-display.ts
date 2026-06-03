import { isStructuredToolResult } from "./tool-result";
import {
  parseStepRunnerGetFromQkrpcData,
  parseStepRunnerGetInput,
  parseStepRunnerSearchFromQkrpcData,
} from "./step-runner-tool";

/** Chat tool rows: no expandable JSON / inline previews; one static summary row. */
export function shouldUseStaticToolRow(options: {
  needsApprovalUi: boolean;
  hasFileEditorPreview: boolean;
  hasReadFilePreview: boolean;
  isDocsOpenable: boolean;
  isWorkspaceFileOpenRow: boolean;
}): boolean {
  if (options.needsApprovalUi) return false;
  if (options.hasFileEditorPreview) return false;
  if (options.hasReadFilePreview) return false;
  if (options.isDocsOpenable) return false;
  if (options.isWorkspaceFileOpenRow) return false;
  return true;
}

const DELETE_TOOLS = new Set([
  "qkrpc_action_delete",
  "qkrpc_subprogram_delete",
]);

/** @deprecated Chat uses static tool rows; inline preview is disabled in ToolPart. */
export function toolHasInlinePreview(_toolName: string): boolean {
  return false;
}

export function hasFailedStructuredToolOutput(output: unknown): boolean {
  return isStructuredToolResult(output) && !output.ok;
}

/** Show expandable request/response JSON for debugging failed tool calls. */
export function shouldShowToolDebugDetails(
  state: string,
  output: unknown,
  needsApprovalUi = false,
): boolean {
  return shouldDefaultExpandToolDetails(
    state,
    needsApprovalUi,
    hasFailedStructuredToolOutput(output),
  );
}

/** Expand raw request/response details by default (errors only). */
export function shouldDefaultExpandToolDetails(
  state: string,
  needsApprovalUi: boolean,
  hasFailedToolOutput = false,
): boolean {
  if (needsApprovalUi) return true;
  return state === "output-error" || hasFailedToolOutput;
}

export function parseSingleIdInput(input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const obj = input as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  if (keys.length !== 1 || keys[0] !== "id") return null;
  const id = obj.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function readResultEntityId(data: Record<string, unknown>): string | null {
  const id = data.actionId ?? data.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function isShallowCompactResultData(data: unknown): data is Record<string, unknown> {
  if (data === null || data === undefined) return true;
  if (typeof data !== "object" || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;
  if (Object.keys(obj).length > 12) return false;
  return Object.values(obj).every(
    (v) => v === null || v === undefined || typeof v !== "object",
  );
}

/** Request is a single id already reflected in a successful result. */
export function shouldSkipRedundantToolRequest(
  input: unknown,
  output: unknown,
): boolean {
  if (!isStructuredToolResult(output) || !output.ok) return false;

  const srInput = parseStepRunnerGetInput(input);
  if (srInput) {
    const parsed = parseStepRunnerGetFromQkrpcData(output.data, input);
    if (parsed && parsed.key === srInput.key) return true;
  }

  const inputId = parseSingleIdInput(input);
  if (!inputId) return false;

  const data = output.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return false;
  }
  const d = data as Record<string, unknown>;
  if (d.action === "delete") return true;
  const outId = readResultEntityId(d);
  return outId !== null && outId === inputId;
}

/** Summary line already conveys the outcome; omit expandable request/response body. */
export function isSummaryOnlyToolResult(
  toolName: string,
  input: unknown,
  output: unknown,
): boolean {
  if (!isStructuredToolResult(output) || !output.ok) return false;

  if (toolName === "qkrpc_step_runner_get") {
    return parseStepRunnerGetFromQkrpcData(output.data, input) !== null;
  }
  if (toolName === "qkrpc_step_runner_search") {
    return parseStepRunnerSearchFromQkrpcData(output.data, input) !== null;
  }

  const data = output.data;
  if (!isShallowCompactResultData(data)) return false;
  const d = data as Record<string, unknown>;

  if (DELETE_TOOLS.has(toolName) && d.action === "delete") {
    return typeof d.message === "string" && d.message.trim().length > 0;
  }

  if (toolName === "qkrpc_ping" && d.action === "ping" && d.pong) {
    return true;
  }

  const message = typeof d.message === "string" ? d.message.trim() : "";
  if (!message) return false;

  const skipKeys = new Set(["message", "actionId", "id", "action"]);
  const extraKeys = Object.keys(d).filter(
    (k) => !skipKeys.has(k) && d[k] !== undefined,
  );
  if (extraKeys.length > 0) return false;

  const inputId = parseSingleIdInput(input);
  const outId = readResultEntityId(d);
  if (outId && inputId && outId !== inputId) return false;

  return true;
}

/** Expanded result body adds nothing beyond the summary line. */
export function shouldOmitCompactToolResultBody(
  input: unknown,
  output: unknown,
): boolean {
  if (!isStructuredToolResult(output) || !output.ok) return false;
  const data = output.data;
  if (!isShallowCompactResultData(data)) return false;
  const d = data as Record<string, unknown>;

  const message = typeof d.message === "string" ? d.message.trim() : "";
  const inputId = parseSingleIdInput(input);
  const outId = readResultEntityId(d);

  if (d.action === "delete" && message) return true;
  if (message && (!outId || (inputId && outId === inputId))) return true;

  if (outId && inputId && outId === inputId && !message) {
    const keys = Object.keys(d).filter(
      (k) => d[k] !== undefined && !["action", "actionId", "id"].includes(k),
    );
    return keys.length === 0;
  }

  return false;
}
