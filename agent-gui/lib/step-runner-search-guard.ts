import { buildAgentTurnState } from "@/lib/agent-turn-state";
import {
  rankPatternSkillsScored,
  shouldStrictSingleStepRunnerSearch,
  suggestStepRunnerOrQuery,
} from "@/lib/agent-skills/skill-intent-preload";
import { getStepRunnerSearchCountThisTurn } from "@/lib/program-turn-context";
import { getRequestLastUserText, getRequestThreadId } from "@/lib/qkrpc-request-context";
import {
  consumeStepRunnerOrSearchRetry,
  getFirstStepRunnerSearchQuery,
} from "@/lib/step-runner-search-cache";
import { attachToolFeedback, formatLocalToolResult } from "@/lib/tool-result";
import { formatToolResultForAgent } from "@/lib/tool-result-agent-view";

export type StepRunnerSearchGuardResult =
  | { block: false; orQueryHint?: string }
  | { block: true; message: string; orQuery: string };

/** Clipboard pipeline: one OR search per turn; other authoring tasks may search multiple modules. */
export function evaluateStepRunnerSearchGuard(query: string): StepRunnerSearchGuardResult {
  const userText = getRequestLastUserText()?.trim();
  if (!userText) {
    return { block: false };
  }
  const turnState = buildAgentTurnState({
    actionScope: { pinnedLatestAll: [] },
    chatMode: "agent",
    enabledToolIds: ["qkrpc_step_runner_search"],
    userText,
  });
  if (turnState.intent !== "action_authoring") {
    return { block: false };
  }
  const scored = rankPatternSkillsScored({
    userText,
    intent: turnState.intent,
  });
  const matchedSkills = scored.map((entry) => entry.skill);
  if (matchedSkills.length === 0) {
    return { block: false };
  }
  const strictSingleSearch = shouldStrictSingleStepRunnerSearch(matchedSkills);
  const orQuery = suggestStepRunnerOrQuery(matchedSkills);
  if (!strictSingleSearch || !orQuery) {
    return { block: false };
  }
  const priorSearchCount = getStepRunnerSearchCountThisTurn();
  const threadId = getRequestThreadId();
  const firstQuery = getFirstStepRunnerSearchQuery(threadId);
  const allowOrRetry =
    priorSearchCount >= 1
    && query.includes("|")
    && firstQuery != null
    && !firstQuery.includes("|")
    && consumeStepRunnerOrSearchRetry(threadId);

  if (priorSearchCount >= 1 && !allowOrRetry) {
    const message =
      "Only one step_runner_search per turn for clipboard pipeline — "
      + "reuse prior hits and call qkrpc_step_runner_get for each distinct key. "
      + `Use OR query: ${orQuery}`;
    return { block: true, message, orQuery };
  }
  if (!query.includes("|")) {
    return {
      block: false,
      orQueryHint:
        `Prefer one OR search: ${orQuery} — then qkrpc_step_runner_get each distinct key once.`,
    };
  }
  return { block: false };
}

export function formatBlockedStepRunnerSearchResult(
  query: string,
  limit: number | undefined,
  guard: Extract<StepRunnerSearchGuardResult, { block: true }>,
): Record<string, unknown> {
  const message = guard.message;
  return formatToolResultForAgent(
    "qkrpc_step_runner_search",
    { query, limit },
    attachToolFeedback(
      formatLocalToolResult(
        {
          action: "step-runner-search-blocked",
          success: false,
          errorMessage: message,
          suggestedQuery: guard.orQuery,
        },
        false,
        message,
      ),
      {
        summary: message,
        retryable: false,
        nextActions: [
          {
            tool: "qkrpc_step_runner_get",
            priority: "required",
            reason: "Fetch schema for keys from the first search — do not search again.",
          },
        ],
      },
    ),
  );
}
