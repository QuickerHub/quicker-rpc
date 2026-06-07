import type { LauncherResolveCandidate } from "@/lib/launcher/launcher-resolve-presets";

/** One executable step for the launcher agent. */
export type LauncherResolveAgentNext = {
  tool: string;
  input: Record<string, unknown>;
};

export type LauncherResolveAgentAlternative = {
  kind: string;
  label: string;
  tool: string;
  input: Record<string, unknown>;
};

/** Compact launcher_resolve tool output (no duplicate RPC envelope). */
export type LauncherResolveAgentOutput = {
  ok: boolean;
  query?: string;
  /** Call this tool next with the given input. */
  next?: LauncherResolveAgentNext;
  /** Only when runner-up is close in score — pick manually if needed. */
  alternatives?: LauncherResolveAgentAlternative[];
  message?: string;
};

/** Score gap below this → include up to 2 alternatives. */
export const LAUNCHER_RESOLVE_AMBIGUITY_SCORE_GAP = 120;

export const LAUNCHER_RESOLVE_DIRECT_MIN_TOP_SCORE = 900;
export const LAUNCHER_RESOLVE_DIRECT_MIN_SCORE_GAP = 80;

function buildLabel(candidate: LauncherResolveCandidate): string {
  const title = candidate.title.trim();
  const sub = candidate.subtitle?.trim();
  if (title && sub && title !== sub) return `${title} · ${sub}`;
  return title || sub || candidate.kind;
}

export function candidateToNextStep(
  candidate: LauncherResolveCandidate,
): LauncherResolveAgentNext | null {
  const tool = candidate.suggestedTool?.trim();
  if (!tool) return null;
  const input = candidate.suggestedInput;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { tool, input: {} };
  }
  return { tool, input };
}

export function isLauncherResolveDirectEligible(
  candidates: LauncherResolveCandidate[],
): boolean {
  const top = candidates[0];
  if (!top || top.score < LAUNCHER_RESOLVE_DIRECT_MIN_TOP_SCORE) {
    return false;
  }
  if (!candidateToNextStep(top)) return false;
  const second = candidates[1];
  if (!second) return true;
  return top.score - second.score >= LAUNCHER_RESOLVE_DIRECT_MIN_SCORE_GAP;
}

export function formatLauncherResolveForAgent(
  query: string,
  candidates: LauncherResolveCandidate[],
): LauncherResolveAgentOutput {
  if (candidates.length === 0) {
    return {
      ok: false,
      query,
      message: "No match; rephrase or use qkrpc_action_query / quicker_settings search.",
    };
  }

  const top = candidates[0]!;
  const next = candidateToNextStep(top);
  if (!next) {
    return {
      ok: false,
      query,
      message: "Top match has no executable tool step.",
    };
  }

  const output: LauncherResolveAgentOutput = {
    ok: true,
    query,
    next,
    message: `Execute next.tool with next.input (${buildLabel(top)}).`,
  };

  const second = candidates[1];
  if (
    second
    && top.score - second.score < LAUNCHER_RESOLVE_AMBIGUITY_SCORE_GAP
  ) {
    const alternatives: LauncherResolveAgentAlternative[] = [];
    for (const candidate of candidates.slice(1, 3)) {
      const step = candidateToNextStep(candidate);
      if (!step) continue;
      alternatives.push({
        kind: candidate.kind,
        label: buildLabel(candidate),
        tool: step.tool,
        input: step.input,
      });
    }
    if (alternatives.length > 0) {
      output.alternatives = alternatives;
      output.message =
        "Top match is close to alternatives — prefer next unless user intent clearly differs.";
    }
  }

  return output;
}
