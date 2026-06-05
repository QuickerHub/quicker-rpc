import {
  getToolOrDynamicToolName,
  isTextUIPart,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import {
  defaultActionLinkLabel,
  hasAssistantActionLinks,
  normalizeActionId,
  parseAssistantMessageSegments,
  type ActionLinkOp,
  type ParsedActionLink,
} from "@/lib/action-link-markup";
import { isStructuredToolResult } from "@/lib/tool-result";
import { readWorkspaceProgramAction } from "@/lib/workspace-program-tool";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tools that persist an action workspace program to Quicker. */
export const ACTION_SAVE_TOOL_NAMES = new Set([
  "workspace_program_patch",
  "qkrpc_action_patch",
  "workspace_program",
]);

function isActionPatchTool(toolName: string, input?: unknown): boolean {
  if (toolName === "workspace_program") {
    return readWorkspaceProgramAction(input) === "patch";
  }
  return ACTION_SAVE_TOOL_NAMES.has(toolName);
}

const DEFAULT_CARD_OPS: readonly ActionLinkOp[] = [
  "run",
  "edit",
  "float",
  "workspace",
];

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readPayload(root: Record<string, unknown>): Record<string, unknown> {
  const nested = readRecord(root.payload);
  return nested ?? root;
}

function isSuccessfulPatchOutput(output: unknown): boolean {
  if (!isStructuredToolResult(output) || !output.ok) return false;
  const root = readRecord(output.data);
  if (!root) return false;
  const payload = readPayload(root);
  if (payload.success === false || payload.ok === false) return false;
  return true;
}

function readPatchTarget(input: unknown): string {
  const root = readRecord(input);
  const target = root?.target;
  return typeof target === "string" && target.trim()
    ? target.trim()
    : "action";
}

function readActionIdFromPatchInput(input: unknown): string | undefined {
  const root = readRecord(input);
  const id = root?.id;
  return typeof id === "string" && isUuid(id) ? id.trim().toLowerCase() : undefined;
}

function readActionIdFromPatchOutput(output: unknown): string | undefined {
  if (!isStructuredToolResult(output) || !output.ok) return undefined;
  const root = readRecord(output.data);
  if (!root) return undefined;
  const payload = readPayload(root);
  const id = payload.actionId;
  return typeof id === "string" && isUuid(id) ? id.trim().toLowerCase() : undefined;
}

function isActionPatchTarget(target: string): boolean {
  return target === "action" || target === "embedded_subprogram";
}

export function buildDefaultActionLinks(actionId: string): ParsedActionLink[] {
  const id = normalizeActionId(actionId);
  if (!id) return [];
  return DEFAULT_CARD_OPS.map((op) => ({
    actionId: id,
    op,
    label: defaultActionLinkLabel(op),
  }));
}

/** Action ids already rendered via assistant <qka-link> markup in this turn. */
export function collectActionLinkIdsFromTurn(messages: UIMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts ?? []) {
      if (!isTextUIPart(part) || !hasAssistantActionLinks(part.text)) continue;
      for (const segment of parseAssistantMessageSegments(part.text)) {
        if (segment.type === "link") {
          ids.add(segment.link.actionId);
        }
      }
    }
  }
  return ids;
}

export function parseSuccessfulActionPatchFromToolPart(part: {
  state?: string;
  input?: unknown;
  output?: unknown;
}): { actionId: string } | null {
  if (part.state !== "output-available") return null;
  if (!isSuccessfulPatchOutput(part.output)) return null;
  if (!isActionPatchTarget(readPatchTarget(part.input))) return null;

  const actionId =
    readActionIdFromPatchInput(part.input)
    ?? readActionIdFromPatchOutput(part.output);
  if (!actionId) return null;
  return { actionId };
}

/** Last successful action patch in chronological order within one user turn. */
export function findLastSuccessfulActionPatchInTurn(
  messages: UIMessage[],
): { actionId: string } | null {
  let last: { actionId: string } | null = null;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts ?? []) {
      if (!isToolOrDynamicToolUIPart(part)) continue;
      const toolName = getToolOrDynamicToolName(part);
      if (!isActionPatchTool(toolName, part.input)) continue;
      const parsed = parseSuccessfulActionPatchFromToolPart(part);
      if (parsed) last = parsed;
    }
  }
  return last;
}

/** Fallback action card links when the model omitted <qka-link> after a successful patch. */
export function resolveTurnActionLinkFallback(
  turnMessages: UIMessage[],
): ParsedActionLink[] | null {
  const patch = findLastSuccessfulActionPatchInTurn(turnMessages);
  if (!patch) return null;

  const linkedIds = collectActionLinkIdsFromTurn(turnMessages);
  if (linkedIds.has(patch.actionId)) return null;

  const links = buildDefaultActionLinks(patch.actionId);
  return links.length > 0 ? links : null;
}
