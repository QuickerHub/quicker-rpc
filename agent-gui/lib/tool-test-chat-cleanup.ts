import {
  getToolOrDynamicToolName,
  isTextUIPart,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import { actionProjectDirFromName } from "@/lib/action-project-path-shared";
import {
  invokeActionCommand,
  isQuickerActionMissingError,
} from "@/lib/action-command-client";
import { parseActionIdFromSyncedToolOutput } from "@/lib/action-projects";
import { readQkrpcAction } from "@/lib/qkrpc-action-tool";
import { readWorkspaceProgramAction } from "@/lib/workspace-program-tool";
import { isStructuredToolResult } from "@/lib/tool-result";
import { deleteActionProjectApi } from "@/lib/workspace-explorer-api";
import type { AgentUIMessage } from "@/lib/chat-types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QKA_TAG_RE = /<qka\s+id="([^"]+)"/gi;

const ACTION_ARTIFACT_TOOLS = new Set([
  "qkrpc_action",
  "qkrpc_action_manage",
  "qkrpc_action_get",
  "qkrpc_action_patch",
  "qkrpc_action_create",
  "qkrpc_action_set_metadata",
  "qkrpc_action_delete",
  "qkrpc_action_run",
  "qkrpc_action_move",
  "qkrpc_action_replace",
  "qkrpc_action_edit",
  "qkrpc_action_edit_var",
  "qkrpc_action_publish",
  "workspace_program",
  "workspace_program_patch",
  "workspace_action_read_data",
  "workspace_action_write_data",
  "workspace_action_edit_data",
  "workspace_action_file_read",
  "workspace_action_file_write",
  "workspace_action_file_edit",
  "workspace_action_file_info",
  "workspace_action_file_search",
]);

export type ToolTestChatCleanupResult = {
  clearedMessages: boolean;
  actionIds: string[];
  deletedInQuicker: string[];
  deletedInWorkspace: string[];
  errors: string[];
};

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function readIdFromRecord(record: Record<string, unknown>): string | undefined {
  for (const key of ["id", "actionId", "ActionId"]) {
    const value = record[key];
    if (typeof value === "string" && isUuid(value)) {
      return value.trim();
    }
  }
  return undefined;
}

function readActionIdFromToolPart(part: {
  input?: unknown;
  output?: unknown;
}): string | undefined {
  if (typeof part.input === "object" && part.input !== null) {
    const fromInput = readIdFromRecord(part.input as Record<string, unknown>);
    if (fromInput) return fromInput;
  }

  if (isStructuredToolResult(part.output) && part.output.ok) {
    const data = part.output.data;
    if (typeof data === "object" && data !== null) {
      const root = data as Record<string, unknown>;
      const payload =
        typeof root.payload === "object" && root.payload !== null
          ? (root.payload as Record<string, unknown>)
          : root;
      const fromOutput = readIdFromRecord(payload);
      if (fromOutput) return fromOutput;
    }
  }

  return parseActionIdFromSyncedToolOutput(part.output);
}

function shouldCollectActionIdFromTool(
  toolName: string,
  input?: unknown,
): boolean {
  if (ACTION_ARTIFACT_TOOLS.has(toolName)) return true;
  if (toolName === "qkrpc_action_query") return false;
  if (toolName === "qkrpc_action_manage") {
    const action = readQkrpcAction(input);
    return action === "create";
  }
  if (toolName === "qkrpc_action") {
    const action = readQkrpcAction(input);
    return action != null && action !== "list" && action !== "search";
  }
  if (toolName === "workspace_program") {
    const action = readWorkspaceProgramAction(input);
    if (!action || action === "projects_list") return false;
    if (typeof input === "object" && input !== null) {
      const target = (input as Record<string, unknown>).target;
      if (typeof target === "string" && target !== "action" && target !== "all") {
        return false;
      }
    }
    return true;
  }
  return false;
}

function extractQkaIdsFromText(text: string): string[] {
  const ids: string[] = [];
  const re = new RegExp(QKA_TAG_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const id = match[1]?.trim();
    if (id && isUuid(id)) ids.push(id);
  }
  return ids;
}

/** Collect unique action GUIDs referenced in a tool-test chat session. */
export function collectActionIdsFromChatMessages(
  messages: UIMessage[],
): string[] {
  const ids = new Set<string>();

  for (const message of messages) {
    for (const part of message.parts) {
      if (isTextUIPart(part) && message.role === "user") {
        for (const id of extractQkaIdsFromText(part.text)) {
          ids.add(id.toLowerCase());
        }
      }
      if (!isToolOrDynamicToolUIPart(part)) continue;
      const toolName = getToolOrDynamicToolName(part);
      if (!shouldCollectActionIdFromTool(toolName, part.input)) continue;
      const actionId = readActionIdFromToolPart(part);
      if (actionId) ids.add(actionId.toLowerCase());
    }
  }

  return [...ids];
}

/** Flatten chat messages from tool-test run records (title / auto-fix panes). */
export function flattenChatMessagesFromRuns(
  runs: ReadonlyArray<{ chatMessages?: AgentUIMessage[] }>,
): AgentUIMessage[] {
  const out: AgentUIMessage[] = [];
  for (const run of runs) {
    if (run.chatMessages?.length) {
      out.push(...run.chatMessages);
    }
  }
  return out;
}

export function formatToolTestCleanupHint(
  result: ToolTestChatCleanupResult,
  clearedLabel = "已清空",
): string {
  const parts: string[] = [];
  if (result.actionIds.length === 0) {
    parts.push(clearedLabel);
  } else {
    parts.push(`${clearedLabel} · 处理 ${result.actionIds.length} 个动作`);
    if (result.deletedInQuicker.length > 0) {
      parts.push(`Quicker 删除 ${result.deletedInQuicker.length}`);
    }
    if (result.deletedInWorkspace.length > 0) {
      parts.push(`工作区删除 ${result.deletedInWorkspace.length}`);
    }
  }
  if (result.errors.length > 0) {
    parts.push(result.errors[0]!);
  }
  return parts.join(" · ");
}

async function listWorkspaceActionProjectPaths(
  cwd: string,
  actionIds: string[],
): Promise<Map<string, string>> {
  const paths = new Map<string, string>();
  for (const id of actionIds) {
    paths.set(id.toLowerCase(), actionProjectDirFromName(id));
  }

  try {
    const res = await fetch("/api/tools/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolName: "workspace_program",
        input: { action: "projects_list" },
        workingDirectory: cwd,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; output?: unknown };
    if (!data.ok) return paths;
    const output = data.output;
    if (!isStructuredToolResult(output) || !output.ok) return paths;
    const payload = output.data;
    if (typeof payload !== "object" || payload === null) return paths;
    const projects = (payload as Record<string, unknown>).projects;
    if (!Array.isArray(projects)) return paths;

    for (const item of projects) {
      if (typeof item !== "object" || item === null) continue;
      const row = item as Record<string, unknown>;
      const actionId = readIdFromRecord(row);
      const path =
        typeof row.path === "string" && row.path.trim()
          ? row.path.trim()
          : undefined;
      if (!actionId || !path) continue;
      const key = actionId.toLowerCase();
      if (paths.has(key)) {
        paths.set(key, path);
      }
    }
  } catch {
    // Fall back to default `.quicker/actions/{id}` paths.
  }

  return paths;
}

export async function cleanupToolTestChatSession(params: {
  cwd?: string;
  messages: AgentUIMessage[];
}): Promise<ToolTestChatCleanupResult> {
  const actionIds = collectActionIdsFromChatMessages(params.messages);
  const deletedInQuicker: string[] = [];
  const deletedInWorkspace: string[] = [];
  const errors: string[] = [];
  const cwd = params.cwd?.trim() ?? "";

  const projectPaths = cwd
    ? await listWorkspaceActionProjectPaths(cwd, actionIds)
    : new Map<string, string>();

  for (const rawId of actionIds) {
    const actionId = rawId;
    const quickerResult = await invokeActionCommand({
      op: "delete",
      id: actionId,
    });
    if (quickerResult.ok) {
      deletedInQuicker.push(actionId);
    } else if (!isQuickerActionMissingError(quickerResult.error)) {
      errors.push(
        `Quicker ${actionId.slice(0, 8)}…: ${quickerResult.error ?? "delete failed"}`,
      );
    }

    if (!cwd) continue;

    const projectPath =
      projectPaths.get(actionId.toLowerCase())
      ?? actionProjectDirFromName(actionId);
    const workspaceResult = await deleteActionProjectApi(cwd, projectPath);
    if (workspaceResult.ok) {
      deletedInWorkspace.push(actionId);
    } else {
      errors.push(
        `Workspace ${actionId.slice(0, 8)}…: ${workspaceResult.error}`,
      );
    }
  }

  if (!cwd && actionIds.length > 0) {
    errors.push("未设置工作目录，已跳过 .quicker/actions 清理");
  }

  return {
    clearedMessages: true,
    actionIds,
    deletedInQuicker,
    deletedInWorkspace,
    errors,
  };
}
