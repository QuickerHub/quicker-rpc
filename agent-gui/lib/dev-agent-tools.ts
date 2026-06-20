import { DEV_FRONTEND_CHECK_TOOL } from "@/lib/dev-frontend-check-tool-constants";

/** Tools registered for local dev only — omitted from production chat tool sets. */
export const DEV_ONLY_TOOL_IDS: readonly string[] = [DEV_FRONTEND_CHECK_TOOL];

export function isDevOnlyToolId(toolId: string): boolean {
  return DEV_ONLY_TOOL_IDS.includes(toolId);
}

export function isDevAgentEnvironment(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function filterDevOnlyToolIds(
  toolIds: readonly string[],
  options?: { includeDev?: boolean },
): string[] {
  const includeDev = options?.includeDev ?? isDevAgentEnvironment();
  if (includeDev) return [...toolIds];
  return toolIds.filter((id) => !isDevOnlyToolId(id));
}

/** Appended to system prompt in dev only — not part of user-facing agent routing. */
export const DEV_AGENT_UI_SYSTEM_BLOCK = [
  "## Dev (local agent-gui repo only)",
  "When you edit agent-gui UI (`components/`, `app/`, UI `lib/`, `globals.css`): loop dev_frontend_check until ok=true, then clearCaptured.",
  "Not for Quicker end users; unavailable in production builds.",
].join("\n");
