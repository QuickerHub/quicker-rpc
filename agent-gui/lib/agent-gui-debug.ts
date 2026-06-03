/** True when running agent-gui in local dev (next dev / start.mjs --dev). */
export function isAgentGuiDebugMode(): boolean {
  return process.env.NODE_ENV === "development";
}
