/** Human-readable hints when live eval chat stream fails before tool calls. */
export function formatAgentEvalChatError(error: string | undefined): string | undefined {
  if (!error) return undefined;
  const normalized = error.trim();
  if (!normalized) return undefined;

  if (
    normalized === "Gone"
    || /\b410\b/.test(normalized)
    || /endpoint.*gone/i.test(normalized)
  ) {
    return `${normalized} — LLM endpoint unavailable (HTTP 410). Run \`pnpm probe:llm-configs\` or set AGENT_EVAL_LLM_SELECTION to a working model.`;
  }

  if (/no assistant message in stream/i.test(normalized)) {
    return `${normalized}. Check LLM config and /api/chat stream (see docs/agent-gui-eval.md).`;
  }

  return normalized;
}
