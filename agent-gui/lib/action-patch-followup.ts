import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import { isStructuredToolResult } from "@/lib/tool-result";
import {
  ACTION_SAVE_TOOL_NAMES,
  parseSuccessfulActionPatchFromToolPart,
} from "@/lib/turn-action-link";
import { normalizeEditVersion } from "@/lib/action-project-info-from-get";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ActionPatchFollowUpContext = {
  actionId: string;
  actionTitle?: string;
  editVersion?: number;
};

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function readActionIdFromPatchOutput(output: unknown): string | undefined {
  if (!isStructuredToolResult(output) || !output.ok) return undefined;
  const data = output.data;
  if (typeof data !== "object" || data === null) return undefined;
  const root = data as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;
  if (payload.success === false) return undefined;
  const id = payload.actionId;
  return typeof id === "string" && isUuid(id) ? id : undefined;
}

function readEditVersionFromPatchOutput(output: unknown): number | undefined {
  if (!isStructuredToolResult(output) || !output.ok) return undefined;
  const data = output.data;
  if (typeof data !== "object" || data === null) return undefined;
  const root = data as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;
  const v = payload.editVersion;
  return normalizeEditVersion(typeof v === "number" ? v : undefined);
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

function readTitleFromToolInput(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const root = input as Record<string, unknown>;
  return readStringField(root, "title");
}

function readTitleFromToolOutput(output: unknown): string | undefined {
  if (!isStructuredToolResult(output) || !output.ok) return undefined;
  const data = output.data;
  if (typeof data !== "object" || data === null) return undefined;
  const root = data as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;

  const title = readStringField(payload, "title");
  if (title) return title;

  // action_get output carries compressed.title
  const compressed =
    typeof payload.compressed === "object" && payload.compressed !== null
      ? (payload.compressed as Record<string, unknown>)
      : undefined;
  if (!compressed) return undefined;
  return readStringField(compressed, "title");
}

function findRecentActionTitle(messages: UIMessage[], actionId: string): string | undefined {
  for (let mi = messages.length - 1; mi >= 0; mi--) {
    const parts = messages[mi]?.parts ?? [];
    for (let pi = parts.length - 1; pi >= 0; pi--) {
      const part = parts[pi]!;
      if (!isToolOrDynamicToolUIPart(part)) continue;

      const input =
        typeof part.input === "object" && part.input !== null
          ? (part.input as Record<string, unknown>)
          : undefined;
      const inputId = typeof input?.id === "string" ? input.id : undefined;
      if (!inputId || inputId !== actionId) continue;

      const titleFromInput = readTitleFromToolInput(part.input);
      if (titleFromInput) return titleFromInput;

      const titleFromOutput = readTitleFromToolOutput(part.output);
      if (titleFromOutput) return titleFromOutput;
    }
  }
  return undefined;
}

function parsePatchToolPart(part: {
  state?: string;
  input?: unknown;
  output?: unknown;
}): { actionId: string; editVersion?: number } | null {
  const parsed = parseSuccessfulActionPatchFromToolPart(part);
  if (!parsed) return null;
  return {
    actionId: parsed.actionId,
    editVersion: readEditVersionFromPatchOutput(part.output),
  };
}

/** Last completed tool call in the thread (chronological). */
export function findLastToolCall(
  messages: UIMessage[],
): { toolName: string; part: UIMessage["parts"][number] } | null {
  for (let mi = messages.length - 1; mi >= 0; mi--) {
    const parts = messages[mi]?.parts ?? [];
    for (let pi = parts.length - 1; pi >= 0; pi--) {
      const part = parts[pi]!;
      if (!isToolOrDynamicToolUIPart(part)) continue;
      return {
        toolName: getToolOrDynamicToolName(part),
        part,
      };
    }
  }
  return null;
}

/** When the last tool call is a successful action patch, return context for follow-up UI. */
export function findActionPatchFollowUp(
  messages: UIMessage[],
): ActionPatchFollowUpContext | null {
  const last = findLastToolCall(messages);
  if (!last || !ACTION_SAVE_TOOL_NAMES.has(last.toolName)) return null;
  if (!isToolOrDynamicToolUIPart(last.part)) return null;
  const parsed = parsePatchToolPart(last.part);
  if (!parsed) return null;
  return {
    actionId: parsed.actionId,
    actionTitle: findRecentActionTitle(messages, parsed.actionId),
    editVersion: parsed.editVersion,
  };
}

export function formatActionIdShort(actionId: string): string {
  const id = actionId.trim();
  if (id.length <= 13) return id;
  return `${id.slice(0, 8)}…`;
}
