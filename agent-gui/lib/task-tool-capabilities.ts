import type { ToolSet } from "ai";
import { TASK_TOOL } from "@/lib/task-tool-constants";
import { pickEnabledTools } from "@/lib/tool-registry";

export type TaskParentCapabilities = {
  toolCallId?: string;
  tools: ToolSet;
  abortSignal?: AbortSignal;
  /** Re-project this turn's provider reference after the child has narrowed its tools. */
  knowledgeForTools?: (toolIds: readonly string[]) => string;
};

/** Preserve the parent's exact policy wrappers; delegation may only narrow them. */
export function selectSubagentTools(
  parentTools: ToolSet,
  allowedToolIds: string[] | undefined,
): ToolSet {
  // Nested generateText has no renderer addToolOutput channel. Never replace a
  // client definition with a similarly named server/disk tool from a registry.
  const inherited = Object.fromEntries(Object.entries(parentTools)
    .filter(([id, definition]) => id !== TASK_TOOL && typeof definition.execute === "function"));
  return pickEnabledTools(inherited, allowedToolIds);
}
