import type { ToolSet } from "ai";
import { TASK_TOOL } from "@/lib/task-tool-constants";
import { pickEnabledTools } from "@/lib/tool-registry";

export type TaskParentCapabilities = {
  toolCallId?: string;
  tools: ToolSet;
  abortSignal?: AbortSignal;
};

/** Preserve the parent's exact policy wrappers; delegation may only narrow them. */
export function selectSubagentTools(
  parentTools: ToolSet,
  allowedToolIds: string[] | undefined,
): ToolSet {
  const inherited = { ...parentTools };
  delete inherited[TASK_TOOL];
  return pickEnabledTools(inherited, allowedToolIds);
}
