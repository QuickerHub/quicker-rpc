import type { AgentUIMessage } from "@/lib/chat-types";
import { groupMessagesIntoApiRounds } from "@/lib/context-api-rounds";
import { readWorkspaceProgramAction } from "@/lib/workspace-program-tool";

const PATCH_LIKE_ACTIONS = new Set([
  "patch",
  "file_write",
  "file_edit",
  "write_data",
  "edit_data",
]);

const LEGACY_PATCH_TOOLS = new Set([
  "workspace_program_patch",
  "workspace_action_file_write",
  "workspace_action_file_edit",
  "workspace_action_write_data",
  "workspace_action_edit_data",
  "qkrpc_action_patch",
  "qkrpc_subprogram_patch",
]);

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function pathFromToolInput(
  toolName: string,
  input: unknown,
): string | null {
  const record = readRecord(input);
  if (!record) return null;

  if (toolName === "workspace_program") {
    const action = readWorkspaceProgramAction(input);
    if (action == null || !PATCH_LIKE_ACTIONS.has(action)) return null;
  } else if (!LEGACY_PATCH_TOOLS.has(toolName)) {
    return null;
  }

  return readPath(record.path)
    ?? readPath(record.file)
    ?? readPath(record.filePath);
}

function isSuccessfulToolPart(
  part: AgentUIMessage["parts"][number],
): part is AgentUIMessage["parts"][number] & {
  input?: unknown;
  output?: unknown;
} {
  if (!part.type.startsWith("tool-") || !("state" in part)) return false;
  if (part.state !== "output-available") return false;
  const output = readRecord("output" in part ? part.output : null);
  return output?.ok !== false;
}

/** Collect recently patched/written workspace paths from UI messages. */
export function collectRecentPatchPaths(
  messages: AgentUIMessage[],
  options?: {
    /** Only scan the last N API rounds. */
    maxRounds?: number;
    maxPaths?: number;
  },
): string[] {
  const maxRounds = options?.maxRounds ?? 4;
  const maxPaths = options?.maxPaths ?? 4;
  const rounds = groupMessagesIntoApiRounds(messages);
  const scanRounds = rounds.slice(Math.max(0, rounds.length - maxRounds));

  const paths: string[] = [];
  const seen = new Set<string>();

  for (const round of scanRounds) {
    for (const message of round) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (!isSuccessfulToolPart(part)) continue;
        const toolName = part.type.slice("tool-".length);
        const path = pathFromToolInput(toolName, part.input);
        if (!path || seen.has(path)) continue;
        seen.add(path);
        paths.push(path);
        if (paths.length >= maxPaths) return paths;
      }
    }
  }

  return paths;
}

export function renderPostCompactReinjectBlock(
  entries: Array<{ path: string; content: string; truncated: boolean }>,
): string | null {
  if (entries.length === 0) return null;
  const sections = entries.map((entry) => {
    const suffix = entry.truncated ? " (truncated)" : "";
    return `### ${entry.path}${suffix}\n${entry.content.trim()}`;
  });
  return (
    "Recent workspace files (reinjected after compression):\n"
    + sections.join("\n\n")
  );
}

export type PostCompactReinjectResult = {
  block: string | null;
  paths: string[];
};
