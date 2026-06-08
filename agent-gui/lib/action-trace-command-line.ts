export function buildActionTraceCommandLine(
  actionId: string,
  param?: string,
): string {
  const parts = ["qkrpc", "action", "run", "--id", actionId, "--trace"];
  if (param?.trim()) {
    parts.push("--param", JSON.stringify(param.trim()));
  }
  return parts.join(" ");
}

export function buildInlineXActionTraceCommandLine(param?: string): string {
  const parts = ["qkrpc", "action", "run", "--xaction-file", "<program.json>", "--trace"];
  if (param?.trim()) {
    parts.push("--param", JSON.stringify(param.trim()));
  }
  return parts.join(" ");
}
