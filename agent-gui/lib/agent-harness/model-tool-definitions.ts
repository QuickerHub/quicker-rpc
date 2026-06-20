import type { Tool } from "ai";
import { z } from "zod";

import { LIST_TOOLS_TOOL } from "@/lib/list-tools-tool";
import { QKRPC_TOOL_REGISTRY } from "@/lib/tool-registry";
import { SET_THREAD_TITLE_TOOL } from "@/lib/thread-title-tool-messages";

/** Tools that always keep full JSON Schema when bundle slimming is active. */
export const CORE_FULL_SCHEMA_TOOL_IDS: ReadonlySet<string> = new Set([
  LIST_TOOLS_TOOL,
  SET_THREAD_TITLE_TOOL,
  "docs",
  "Read",
  "Write",
  "StrReplace",
  "Grep",
  "Shell",
  "web_search",
  "qkrpc_wait",
  "ask_question",
  "quicker_settings",
  "workspace_program",
  "qkrpc_action_query",
  "qkrpc_action_get",
  "qkrpc_action_run",
  "qkrpc_action_debug",
  "qkrpc_action_create",
  "qkrpc_subprogram_query",
  "qkrpc_subprogram_get",
  "qkrpc_subprogram_create",
  "qkrpc_step_runner_search",
  "qkrpc_step_runner_get",
]);

export const SLIM_EXTENDED_TOOL_INPUT_SCHEMA = z
  .object({})
  .passthrough()
  .describe(
    "Specialized tool: call list_tools action=bundle bundleId=<pack> or action=get toolId=<this tool> for full params, then invoke.",
  );

/** Benchmark / debug: register every enabled tool with full schema (no slimming). */
export function isFullToolSchemasForAllEnabled(): boolean {
  return process.env.HARNESS_FULL_TOOL_SCHEMAS === "1";
}

/** @deprecated Alias — slimming follows tool bundles unless HARNESS_FULL_TOOL_SCHEMAS=1. */
export function isSlimToolSchemasEnabled(): boolean {
  return !isFullToolSchemasForAllEnabled();
}

function registryDescription(toolId: string): string | undefined {
  return QKRPC_TOOL_REGISTRY.find((item) => item.id === toolId)?.description;
}

function buildSlimToolDescription(toolId: string, fullDescription?: string): string {
  const registryLine = registryDescription(toolId);
  const base = registryLine ?? fullDescription ?? toolId;
  return `${base} Full params: list_tools action=get toolId=${toolId} (or action=bundle bundleId=…).`;
}

export function slimToolDefinition(
  toolId: string,
  full: Tool,
  fullSchemaToolIds: ReadonlySet<string>,
): Tool {
  if (fullSchemaToolIds.has(toolId)) {
    return full;
  }
  const fullRecord = full as Tool & { description?: string };
  return {
    ...full,
    description: buildSlimToolDescription(toolId, fullRecord.description),
    inputSchema: SLIM_EXTENDED_TOOL_INPUT_SCHEMA,
  };
}

export function slimToolsForModel<T extends Record<string, Tool>>(
  fullTools: T,
  fullSchemaToolIds: ReadonlySet<string>,
): T {
  if (isFullToolSchemasForAllEnabled()) {
    return fullTools;
  }
  const next = {} as T;
  for (const key of Object.keys(fullTools) as Array<keyof T>) {
    next[key] = slimToolDefinition(
      String(key),
      fullTools[key],
      fullSchemaToolIds,
    ) as T[keyof T];
  }
  return next;
}

export function countSlimExtendedTools(
  toolIds: readonly string[],
  fullSchemaToolIds: ReadonlySet<string>,
): number {
  return toolIds.filter((id) => !fullSchemaToolIds.has(id)).length;
}
