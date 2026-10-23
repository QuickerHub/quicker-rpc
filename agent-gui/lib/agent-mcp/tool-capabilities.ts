import type { ChatMode } from "@/lib/chat-mode";

export type McpToolCapabilityDescription = {
  name: string;
  annotations?: Record<string, unknown>;
};

/** Unknown MCP effects are not admitted to the read-only Ask surface. */
export function mcpToolAllowedInMode(
  tool: McpToolCapabilityDescription,
  mode: ChatMode,
): boolean {
  if (mode === "launcher") return false;
  if (mode !== "ask") return true;
  return tool.annotations?.readOnlyHint === true
    && tool.annotations?.destructiveHint !== true;
}

/** Filter protocol definitions before the SDK discards capability annotations. */
export function selectMcpToolDefinitions<T extends McpToolCapabilityDescription>(
  tools: readonly T[],
  options: { mode: ChatMode; allowedTools?: readonly string[] },
): T[] {
  const allowed = options.allowedTools === undefined
    ? undefined
    : new Set(options.allowedTools);
  return tools.filter((tool) =>
    (allowed === undefined || allowed.has(tool.name))
    && mcpToolAllowedInMode(tool, options.mode),
  );
}
