function normalize(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Stable client-safe namespace mapping for remote MCP tool names. */
export function mcpToolId(serverName: string, toolName: string): string {
  return `mcp__${normalize(serverName) || "server"}__${normalize(toolName) || "tool"}`;
}

/** A possible mapped id, not proof that its provider exists or its operations are safe. */
export function isNamespacedMcpToolId(toolId: string): boolean {
  if (!toolId.startsWith("mcp__")) return false;
  const names = toolId.slice("mcp__".length);
  // Normalized names have no boundary underscores. Internal underscores, even
  // repeated ones, are allowed, so do not assume the first separator owns the split.
  return normalize(names) === names && /[A-Za-z0-9-]__[A-Za-z0-9-]/.test(names);
}
