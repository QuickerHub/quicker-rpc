import type { ActionScopeHint } from "@/lib/action-scope";
import type { ChatMode } from "@/lib/chat-mode";
import type { AgentTurnIntent } from "@/lib/agent-turn-state";

/** @deprecated Runtime per-turn tool exclusions removed; kept for test imports only. */
export const AUTHORING_EXCLUDED_TOOL_IDS: ReadonlySet<string> = new Set([]);

/** @deprecated Runtime per-turn tool exclusions removed; kept for test imports only. */
export const NON_WEB_EXCLUDED_TOOL_IDS: ReadonlySet<string> = new Set([]);

export type ToolIntentFilterParams = {
  chatMode: ChatMode;
  enabledToolIds: readonly string[];
  intent: AgentTurnIntent;
  actionScope: ActionScopeHint;
  /** Action Designer embed pins a program body — treat as authoring context. */
  actionDesigner?: { entityId: string; isSubProgram?: boolean };
  alwaysOnIds?: readonly string[];
};

/** Returns user-enabled tools unchanged (no intent-based hiding). */
export function filterEnabledToolsForTurn(params: ToolIntentFilterParams): string[] {
  return [...params.enabledToolIds];
}
