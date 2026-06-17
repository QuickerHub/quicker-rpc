/** True when running agent-gui in local dev (next dev / start.mjs --dev). */
export function isAgentGuiDebugMode(): boolean {
  return process.env.NODE_ENV === "development";
}

/** Client-side: Cursor SDK page/API are only available in dev. */
export function isCursorSdkDevEnabled(): boolean {
  return isAgentGuiDebugMode();
}
