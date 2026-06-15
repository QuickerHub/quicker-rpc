"use client";

import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import { useEffect, useRef } from "react";
import { isActionProjectDataPath } from "@/lib/action-project-data-parse";
import { isStructuredToolResult } from "@/lib/tool-result";
import { workspaceExplorerActionsRef } from "@/lib/workspace-explorer";
import {
  effectiveWorkspaceToolId,
  readWorkspaceProgramAction,
} from "@/lib/workspace-program-tool";
import {
  parseWorkspaceProgramTarget,
  workspaceProgramDataJsonPath,
  type ParsedWorkspaceProgramInput,
} from "@/lib/workspace-program-target";
import { formatActionDataJsonPath } from "@/lib/workspace-file-tool";

const DISK_MUTATING_PROGRAM_ACTIONS = new Set([
  "edit_data",
  "write_data",
  "file_edit",
  "file_write",
]);

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readActionIdFromInput(input: unknown): string | undefined {
  const root = readRecord(input);
  return root ? readStringField(root, "id") : undefined;
}

function readPathFromInput(input: unknown): string | undefined {
  const root = readRecord(input);
  return root ? readStringField(root, "path") : undefined;
}

function readPathFromToolOutput(output: unknown): string | undefined {
  if (!isStructuredToolResult(output) || !output.ok) return undefined;
  const root = readRecord(output.data);
  if (!root) return undefined;
  return readStringField(root, "path");
}

function normalizeWorkspaceRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Resolve workspace-relative data.json (or project file) path from a completed disk-mutating tool. */
export function resolveProgramDiskPathFromWorkspaceTool(
  toolName: string,
  input: unknown,
  output?: unknown,
): string | undefined {
  const outputPath = readPathFromToolOutput(output);
  if (outputPath) {
    return normalizeWorkspaceRelativePath(outputPath);
  }

  const effectiveTool = effectiveWorkspaceToolId(toolName, input);
  if (
    effectiveTool === "workspace_action_edit_data"
    || effectiveTool === "workspace_action_write_data"
  ) {
    const actionId = readActionIdFromInput(input);
    return actionId ? formatActionDataJsonPath(actionId) : undefined;
  }

  if (effectiveTool === "workspace_action_file_edit" || effectiveTool === "workspace_action_file_write") {
    const path = readPathFromInput(input);
    return path ? normalizeWorkspaceRelativePath(path) : undefined;
  }

  if (toolName !== "workspace_program" && effectiveTool !== "workspace_program") {
    return undefined;
  }

  const programAction = readWorkspaceProgramAction(input);
  if (!programAction || !DISK_MUTATING_PROGRAM_ACTIONS.has(programAction)) {
    return undefined;
  }

  if (programAction === "file_edit" || programAction === "file_write") {
    const path = readPathFromInput(input);
    return path ? normalizeWorkspaceRelativePath(path) : undefined;
  }

  const root = readRecord(input);
  if (!root) return undefined;
  const parsed = parseWorkspaceProgramTarget({
    target: (readStringField(root, "target") ?? "action") as ParsedWorkspaceProgramInput["target"],
    id: readStringField(root, "id") ?? "",
    subProgramId: readStringField(root, "subProgramId"),
  });
  if (!parsed.ok) return undefined;
  return workspaceProgramDataJsonPath(parsed.target);
}

function shouldReloadPath(path: string): boolean {
  return isActionProjectDataPath(path);
}

function toolPartKey(message: UIMessage, partIndex: number, toolCallId?: string): string {
  return `${message.id}:${partIndex}:${toolCallId ?? partIndex}`;
}

/** After Agent mutates program data on disk, refresh open data.json tabs in the side editor. */
export function useReloadProgramDataFromToolMessages(
  messages: UIMessage[],
  enabled = true,
): void {
  const processedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;

    const paths: string[] = [];
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (let partIndex = 0; partIndex < message.parts.length; partIndex += 1) {
        const part = message.parts[partIndex];
        if (!part || !isToolOrDynamicToolUIPart(part)) continue;
        if (part.state !== "output-available") continue;
        if (!isStructuredToolResult(part.output) || !part.output.ok) continue;

        const key = toolPartKey(message, partIndex, part.toolCallId);
        if (processedRef.current.has(key)) continue;

        const toolName = getToolOrDynamicToolName(part);
        const path = resolveProgramDiskPathFromWorkspaceTool(
          toolName,
          part.input,
          part.output,
        );
        if (!path || !shouldReloadPath(path)) continue;

        processedRef.current.add(key);
        paths.push(path);
      }
    }

    if (paths.length === 0) return;
    workspaceExplorerActionsRef.current.reloadProgramDataPaths(paths);
  }, [enabled, messages]);
}
