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
import {
  readQkrpcSubprogramAction,
  isSubprogramListTool,
} from "@/lib/qkrpc-subprogram-tool";
import { readWorkspaceProgramAction } from "@/lib/workspace-program-tool";
import { isStructuredToolResult } from "@/lib/tool-result";
import { invokeSubProgramCommand, isQuickerSubProgramMissingError } from "@/lib/subprogram-command-client";
import { deleteActionProjectApi } from "@/lib/workspace-explorer-api";
import { globalSubProgramProjectDir } from "@/lib/workspace-program-target";
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
  "qkrpc_action_debug",
  "qkrpc_action_float",
  "qkrpc_action_move",
  "qkrpc_profile_create",
  "qkrpc_process_ensure",
  "qkrpc_action_replace",
  "qkrpc_designer_open",
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

const SUBPROGRAM_ARTIFACT_TOOLS = new Set([
  "qkrpc_subprogram",
  "qkrpc_subprogram_manage",
  "qkrpc_subprogram_get",
  "qkrpc_subprogram_create",
  "qkrpc_subprogram_transfer",
  "qkrpc_subprogram_delete",
  "qkrpc_subprogram_patch",
  "qkrpc_designer_open",
  "workspace_program",
  "workspace_program_patch",
]);

export type ToolTestChatCleanupResult = {
  clearedMessages: boolean;
  actionIds: string[];
  subprogramKeys: string[];
  deletedInQuicker: string[];
  deletedInWorkspace: string[];
  deletedSubprogramsInQuicker: string[];
  deletedSubprogramsInWorkspace: string[];
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

function readSubprogramKeyFromRecord(
  record: Record<string, unknown>,
): string | undefined {
  for (const key of [
    "id",
    "subProgramId",
    "SubProgramId",
    "subprogramId",
    "callIdentifier",
    "name",
  ]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readSubprogramKeyFromToolInput(
  toolName: string,
  input?: unknown,
): string | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  if (toolName === "qkrpc_designer_open") {
    if (record.target !== "global_subprogram") return undefined;
  }
  if (toolName === "workspace_program") {
    const target = record.target;
    if (
      target === "action"
      || target === "embedded_subprogram"
      || target === "all"
      || !target
    ) {
      return undefined;
    }
    const action = readWorkspaceProgramAction(input);
    if (!action || action === "projects_list") return undefined;
  }
  if (toolName === "qkrpc_subprogram") {
    const action = readQkrpcSubprogramAction(input);
    if (!action || action === "list" || action === "search") return undefined;
  }
  return readSubprogramKeyFromRecord(record);
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

function shouldCollectSubprogramKeyFromTool(
  toolName: string,
  input?: unknown,
): boolean {
  if (SUBPROGRAM_ARTIFACT_TOOLS.has(toolName)) {
    if (isSubprogramListTool(toolName, input)) return false;
    if (toolName === "qkrpc_subprogram_query") return false;
    if (toolName === "qkrpc_designer_open") {
      return readSubprogramKeyFromToolInput(toolName, input) != null;
    }
    if (toolName === "workspace_program") {
      return readSubprogramKeyFromToolInput(toolName, input) != null;
    }
    return true;
  }
  if (toolName === "qkrpc_subprogram") {
    const action = readQkrpcSubprogramAction(input);
    return action != null && action !== "list" && action !== "search";
  }
  return false;
}

function normalizeArtifactKey(value: string): string {
  return value.trim().toLowerCase();
}

function readSubprogramKeyFromToolPartWithName(
  toolName: string,
  part: { input?: unknown; output?: unknown },
): string | undefined {
  if (isStructuredToolResult(part.output) && part.output.ok) {
    const data = part.output.data;
    if (typeof data === "object" && data !== null) {
      const root = data as Record<string, unknown>;
      const payload =
        typeof root.payload === "object" && root.payload !== null
          ? (root.payload as Record<string, unknown>)
          : root;
      const fromOutput = readSubprogramKeyFromRecord(payload);
      if (fromOutput) return fromOutput;
    }
  }

  const fromInput = readSubprogramKeyFromToolInput(toolName, part.input);
  if (fromInput) return fromInput;

  return undefined;
}

function shouldCollectActionIdFromTool(
  toolName: string,
  input?: unknown,
): boolean {
  if (ACTION_ARTIFACT_TOOLS.has(toolName)) {
    if (toolName === "qkrpc_designer_open") {
      const record =
        typeof input === "object" && input !== null
          ? (input as Record<string, unknown>)
          : null;
      return record?.target === "action";
    }
    return true;
  }
  if (toolName === "qkrpc_action_query") return false;
  if (toolName === "qkrpc_action_create") return true;
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

/** Collect global subprogram keys referenced in a tool-test chat session. */
export function collectSubprogramKeysFromChatMessages(
  messages: UIMessage[],
): string[] {
  const keys = new Set<string>();

  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolOrDynamicToolUIPart(part)) continue;
      const toolName = getToolOrDynamicToolName(part);
      if (!shouldCollectSubprogramKeyFromTool(toolName, part.input)) continue;
      const subprogramKey = readSubprogramKeyFromToolPartWithName(toolName, part);
      if (subprogramKey) keys.add(normalizeArtifactKey(subprogramKey));
    }
  }

  return [...keys];
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
  const artifactCount = result.actionIds.length + result.subprogramKeys.length;
  if (artifactCount === 0) {
    parts.push(clearedLabel);
  } else {
    if (result.actionIds.length > 0) {
      parts.push(`${clearedLabel} · 动作 ${result.actionIds.length}`);
      if (result.deletedInQuicker.length > 0) {
        parts.push(`Quicker 删动作 ${result.deletedInQuicker.length}`);
      }
      if (result.deletedInWorkspace.length > 0) {
        parts.push(`工作区删动作 ${result.deletedInWorkspace.length}`);
      }
    }
    if (result.subprogramKeys.length > 0) {
      parts.push(`子程序 ${result.subprogramKeys.length}`);
      if (result.deletedSubprogramsInQuicker.length > 0) {
        parts.push(`Quicker 删子程序 ${result.deletedSubprogramsInQuicker.length}`);
      }
      if (result.deletedSubprogramsInWorkspace.length > 0) {
        parts.push(`工作区删子程序 ${result.deletedSubprogramsInWorkspace.length}`);
      }
    }
  }
  if (result.errors.length > 0) {
    parts.push(result.errors[0]!);
  }
  return parts.join(" · ");
}

function readProgramProjectsFromListPayload(
  payload: Record<string, unknown>,
  bucket: "actions" | "globalSubprograms",
): unknown[] | undefined {
  const section = payload[bucket];
  if (typeof section !== "object" || section === null) return undefined;
  const projects = (section as Record<string, unknown>).projects;
  return Array.isArray(projects) ? projects : undefined;
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
    const projects = readProgramProjectsFromListPayload(
      payload as Record<string, unknown>,
      "actions",
    );
    if (!projects) return paths;

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

async function listWorkspaceSubprogramProjectPaths(
  cwd: string,
  subprogramKeys: string[],
): Promise<Map<string, string>> {
  const paths = new Map<string, string>();
  for (const key of subprogramKeys) {
    paths.set(normalizeArtifactKey(key), globalSubProgramProjectDir(key));
  }

  try {
    const res = await fetch("/api/tools/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolName: "workspace_program",
        input: { action: "projects_list", target: "all" },
        workingDirectory: cwd,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; output?: unknown };
    if (!data.ok) return paths;
    const output = data.output;
    if (!isStructuredToolResult(output) || !output.ok) return paths;
    const payload = output.data;
    if (typeof payload !== "object" || payload === null) return paths;
    const projects = readProgramProjectsFromListPayload(
      payload as Record<string, unknown>,
      "globalSubprograms",
    );
    if (!projects) return paths;

    for (const item of projects) {
      if (typeof item !== "object" || item === null) continue;
      const row = item as Record<string, unknown>;
      const subprogramKey =
        readSubprogramKeyFromRecord(row)
        ?? (typeof row.dirName === "string" && row.dirName.trim()
          ? row.dirName.trim()
          : undefined);
      const path =
        typeof row.path === "string" && row.path.trim()
          ? row.path.trim()
          : undefined;
      if (!subprogramKey || !path) continue;
      const key = normalizeArtifactKey(subprogramKey);
      if (paths.has(key)) {
        paths.set(key, path);
      }
    }
  } catch {
    // Fall back to default `.quicker/subprograms/{key}` paths.
  }

  return paths;
}

export async function cleanupToolTestChatSession(params: {
  cwd?: string;
  messages: AgentUIMessage[];
}): Promise<ToolTestChatCleanupResult> {
  const actionIds = collectActionIdsFromChatMessages(params.messages);
  const subprogramKeys = collectSubprogramKeysFromChatMessages(params.messages);
  const deletedInQuicker: string[] = [];
  const deletedInWorkspace: string[] = [];
  const deletedSubprogramsInQuicker: string[] = [];
  const deletedSubprogramsInWorkspace: string[] = [];
  const errors: string[] = [];
  const cwd = params.cwd?.trim() ?? "";

  const actionProjectPaths = cwd
    ? await listWorkspaceActionProjectPaths(cwd, actionIds)
    : new Map<string, string>();
  const subprogramProjectPaths = cwd
    ? await listWorkspaceSubprogramProjectPaths(cwd, subprogramKeys)
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
      actionProjectPaths.get(actionId.toLowerCase())
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

  for (const rawKey of subprogramKeys) {
    const subprogramKey = rawKey;
    const quickerResult = await invokeSubProgramCommand({
      op: "delete",
      id: subprogramKey,
    });
    if (quickerResult.ok) {
      deletedSubprogramsInQuicker.push(subprogramKey);
    } else if (!isQuickerSubProgramMissingError(quickerResult.error)) {
      errors.push(
        `Quicker SP ${subprogramKey.slice(0, 12)}: ${quickerResult.error ?? "delete failed"}`,
      );
    }

    if (!cwd) continue;

    const projectPath =
      subprogramProjectPaths.get(normalizeArtifactKey(subprogramKey))
      ?? globalSubProgramProjectDir(subprogramKey);
    const workspaceResult = await deleteActionProjectApi(cwd, projectPath);
    if (workspaceResult.ok) {
      deletedSubprogramsInWorkspace.push(subprogramKey);
    } else {
      errors.push(
        `Workspace SP ${subprogramKey.slice(0, 12)}: ${workspaceResult.error}`,
      );
    }
  }

  if (!cwd && subprogramKeys.length > 0) {
    errors.push("未设置工作目录，已跳过 .quicker/subprograms 清理");
  }

  return {
    clearedMessages: true,
    actionIds,
    subprogramKeys,
    deletedInQuicker,
    deletedInWorkspace,
    deletedSubprogramsInQuicker,
    deletedSubprogramsInWorkspace,
    errors,
  };
}
