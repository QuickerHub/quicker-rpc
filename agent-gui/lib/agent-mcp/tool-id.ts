/** Stable client-safe namespace mapping for remote MCP tool names. */
export function mcpToolId(serverName: string, toolName: string): string {
  const normalize = (value: string) =>
    value.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return `mcp__${normalize(serverName) || "server"}__${normalize(toolName) || "tool"}`;
}
