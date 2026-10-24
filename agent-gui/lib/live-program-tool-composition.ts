import type { Tool, ToolSet } from "ai";
import type { ToolOperationConstraint, ToolOperationConstraints } from "./agent-tool-mode-guard";
import type { LiveProgramDocumentSelection } from "./live-program-document";

// First live-document slice supplies local memory edits and these companion
// capabilities only. Shell, MCP and native/disk authoring are separate ports.
const companionTools = new Set([
  "docs", "skill_load", "list_tools", "set_thread_title", "ask_question",
  "web_search", "Read", "Grep", "task",
]);

export type LiveProgramToolComposition = Readonly<{
  tools: ToolSet;
  operationConstraints: ToolOperationConstraints;
  clientReadonlyTools: readonly string[];
}>;

const readOperations: ToolOperationConstraint = Object.freeze({ allowedActions: Object.freeze(["read_live"]) });
const editOperations: ToolOperationConstraint = Object.freeze({ allowedActions: Object.freeze(["read_live", "edit_live"]) });

/** The renderer and server composition consume the same operation subset. */
export function liveProgramOperationConstraint(mode: "read" | "edit"): ToolOperationConstraint {
  return mode === "edit" ? editOperations : readOperations;
}

/** Narrow already-selected tools; none is legacy, unavailable is never legacy. */
export function composeLiveProgramTools(tools: ToolSet, selection: LiveProgramDocumentSelection, liveDefinition: Tool): LiveProgramToolComposition {
  if (selection.state === "none") return { tools, operationConstraints: {}, clientReadonlyTools: [] };
  const narrowed: ToolSet = {};
  for (const [id, definition] of Object.entries(tools)) {
    if (id === "workspace_program") {
      if (liveDefinition.execute) throw new Error("The live document tool must use the renderer execution port");
      narrowed[id] = liveDefinition;
    } else if (companionTools.has(id)) narrowed[id] = definition;
  }
  if (!narrowed.workspace_program) return { tools: narrowed, operationConstraints: {}, clientReadonlyTools: [] };
  return {
    tools: narrowed,
    operationConstraints: { workspace_program: liveProgramOperationConstraint(selection.state === "ready" ? selection.scope.mode : "read") },
    clientReadonlyTools: ["workspace_program"],
  };
}
