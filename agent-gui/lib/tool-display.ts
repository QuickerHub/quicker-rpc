/** Tools that render rich inline preview below the summary (action list, etc.). */
const TOOLS_WITH_INLINE_PREVIEW = new Set([
  "qkrpc_action_list",
  "qkrpc_action_search",
]);

export function toolHasInlinePreview(toolName: string): boolean {
  return TOOLS_WITH_INLINE_PREVIEW.has(toolName);
}

/** Expand raw request/response details by default (errors only). */
export function shouldDefaultExpandToolDetails(
  state: string,
  needsApprovalUi: boolean,
): boolean {
  if (needsApprovalUi) return true;
  return state === "output-error";
}
