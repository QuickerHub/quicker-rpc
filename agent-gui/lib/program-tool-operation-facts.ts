import type { ChatMode } from "./chat-mode";

export type ProgramToolExecutionPort = "connected-host" | "compatibility-get" | "local-existing" | "workspace" | "source-bundle" | "renderer-live" | "unavailable";
type Effect = "none" | "possible" | "unknown";
export type ProgramToolOperationFacts = Readonly<{
  operation: string;
  port: ProgramToolExecutionPort;
  known: boolean;
  /** Program content mutation; connection startup is described separately. */
  hostMutation: Effect;
  localPersistence: Effect;
  connectionBootstrap: Effect;
  implicitExport: Effect;
  implicitRepair: Effect;
  backgroundDiagnostics: Effect;
  replayAfterUnknown: "safe" | "unsafe" | "unknown";
}>;

export const WORKSPACE_LOCAL_READ_ACTIONS = Object.freeze(["projects_list", "read_data", "file_read", "file_info", "file_search"] as const);
const workspaceActions = [...WORKSPACE_LOCAL_READ_ACTIONS, "write_data", "edit_data", "file_write", "file_edit", "patch", "diagnostics"] as const;
const getTools = new Set(["qkrpc_action_get", "qkrpc_subprogram_get"]);

/** Port selection only. Final membership, mode, parent scope and approvals remain separate gates. */
export function programToolExecutionPort(toolId: string, mode: ChatMode, readOnlyPortAvailable = false, allowedActions?: readonly string[]): ProgramToolExecutionPort | undefined {
  if (getTools.has(toolId)) return mode === "ask" ? readOnlyPortAvailable ? "connected-host" : "unavailable" : "compatibility-get";
  if (toolId === "qkrpc_action_open") return "source-bundle";
  if (toolId !== "workspace_program") return undefined;
  if (allowedActions?.includes("read_live")) return "renderer-live";
  return mode === "ask" ? readOnlyPortAvailable ? "local-existing" : "unavailable" : "workspace";
}

/** Complete wrapper possibilities for the bounded program ports, not invoke replay or authority. */
export function programToolOperationFacts(toolId: string, input: unknown, port: ProgramToolExecutionPort): ProgramToolOperationFacts {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const action = toolId === "workspace_program" ? typeof value.action === "string" ? value.action : "unknown" : getTools.has(toolId) ? "get" : toolId === "qkrpc_action_open" ? "open" : "unknown";
  const operation = `${toolId}.${action}`;
  const facts = (effects: Omit<ProgramToolOperationFacts, "operation" | "port">): ProgramToolOperationFacts => Object.freeze({ operation, port, ...effects });
  const unknown = () => facts({ known: false, hostMutation: "unknown", localPersistence: "unknown", connectionBootstrap: "unknown", implicitExport: "unknown", implicitRepair: "unknown", backgroundDiagnostics: "unknown", replayAfterUnknown: "unknown" });
  const read = { known: true, hostMutation: "none", localPersistence: "none", connectionBootstrap: "none", implicitExport: "none", implicitRepair: "none", backgroundDiagnostics: "none", replayAfterUnknown: "safe" } as const;
  if (getTools.has(toolId)) {
    if (port === "connected-host") return facts(read);
    if (port === "compatibility-get") return facts({ ...read, localPersistence: "possible", connectionBootstrap: "possible", implicitExport: "possible", replayAfterUnknown: "unsafe" });
    return unknown();
  }
  if (toolId === "qkrpc_action_open" && port === "source-bundle") return facts({ ...read, localPersistence: "possible", connectionBootstrap: "possible", replayAfterUnknown: "unsafe" });
  if (toolId !== "workspace_program" || !workspaceActions.some(item => item === action)) return unknown();
  const localRead = WORKSPACE_LOCAL_READ_ACTIONS.some(item => item === action);
  if (port === "local-existing") return localRead ? facts(read) : unknown();
  if (port !== "workspace") return unknown();
  // Listing may repair subprogram metadata using a remote get. Content reads may
  // export a missing project or fill data.json from existing info.json. Summary
  // and action-only listing avoid those paths; describe the actual selected input.
  if (action === "projects_list") return value.target === "action" ? facts(read)
    : facts({ ...read, localPersistence: "possible", connectionBootstrap: "possible", implicitRepair: "possible", replayAfterUnknown: "unsafe" });
  if (localRead) return action === "read_data" && value.mode === "summary" ? facts(read)
    : facts({ ...read, localPersistence: "possible", connectionBootstrap: "possible", implicitExport: "possible", implicitRepair: "possible", replayAfterUnknown: "unsafe" });
  if (action === "diagnostics") return facts({ ...read, connectionBootstrap: "possible", localPersistence: "unknown", replayAfterUnknown: "unknown" });
  // Disk edits can schedule remote syntax lint; patch also writes program content
  // and refreshes local checkpoints. They are not local-only even before patch.
  return facts({ ...read, hostMutation: action === "patch" ? "possible" : "none", localPersistence: "possible", connectionBootstrap: "possible", implicitExport: "possible", implicitRepair: "possible", backgroundDiagnostics: "possible", replayAfterUnknown: "unsafe" });
}

export function isSideEffectFreeProgramRead(facts: ProgramToolOperationFacts): boolean {
  return facts.known && [facts.hostMutation, facts.localPersistence, facts.connectionBootstrap,
    facts.implicitExport, facts.implicitRepair, facts.backgroundDiagnostics].every(effect => effect === "none");
}

/** Observe the actual definition without invoking dynamic approval callbacks. */
export function describeToolApproval(needsApproval: unknown): boolean | "runtime" | "unknown" {
  return typeof needsApproval === "boolean" ? needsApproval : typeof needsApproval === "function" ? "runtime" : "unknown";
}

export function describeProgramToolOperations(toolId: string, mode: ChatMode, readOnlyPortAvailable = false, allowedActions?: readonly string[]) {
  const port = programToolExecutionPort(toolId, mode, readOnlyPortAvailable, allowedActions);
  if (!port) return undefined;
  const actions = toolId === "workspace_program" ? allowedActions ?? workspaceActions : [undefined];
  return actions.map(action => programToolOperationFacts(toolId, action === undefined ? {} : { action }, port));
}
