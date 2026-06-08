import type { LauncherResolveCandidate } from "@/lib/launcher/launcher-resolve-presets";

/** Which query segment matched and on what field. */
export type LauncherResolveAgentMatch = {
  term: string;
  on: string;
};

/** One executable step for the launcher agent. */
export type LauncherResolveAgentNext = {
  tool: string;
  input: Record<string, unknown>;
  match?: LauncherResolveAgentMatch;
};

export type LauncherResolveAgentAlternative = {
  kind: string;
  label: string;
  tool: string;
  input: Record<string, unknown>;
  match?: LauncherResolveAgentMatch;
};

export type LauncherResolveAgentRanked = {
  kind: string;
  label: string;
  score: number;
  match?: LauncherResolveAgentMatch;
};

/** Compact launcher_resolve tool output (no duplicate RPC envelope). */
export type LauncherResolveAgentOutput = {
  ok: boolean;
  query?: string;
  /** Parsed <code>|</code> alternatives from query. */
  queryTerms?: string[];
  /** Terms that matched no candidate — retry with other synonyms. */
  missedTerms?: string[];
  /** Direct-eligible only — absent when disambiguationRequired. */
  next?: LauncherResolveAgentNext;
  /** Ranked matches need ask_question before run/open. */
  disambiguationRequired?: boolean;
  /** Only when runner-up is close in score — pick manually if needed. */
  alternatives?: LauncherResolveAgentAlternative[];
  /** Top candidates with match attribution for follow-up resolve. */
  ranked?: LauncherResolveAgentRanked[];
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

function buildMatch(
  candidate: LauncherResolveCandidate,
): LauncherResolveAgentMatch | undefined {
  const term = candidate.matchedQueryTerm?.trim();
  const on = candidate.matchedOn?.trim();
  if (!term || !on) return undefined;
  return { term, on };
}

export function candidateToNextStep(
  candidate: LauncherResolveCandidate,
): LauncherResolveAgentNext | null {
  const tool = candidate.suggestedTool?.trim();
  if (!tool) return null;
  const input = candidate.suggestedInput;
  const base =
    !input || typeof input !== "object" || Array.isArray(input)
      ? { tool, input: {} }
      : { tool, input };
  const match = buildMatch(candidate);
  return match ? { ...base, match } : base;
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
  meta?: { queryTerms?: string[]; missedTerms?: string[] },
): LauncherResolveAgentOutput {
  const queryTerms = meta?.queryTerms?.length ? meta.queryTerms : undefined;
  const missedTerms = meta?.missedTerms?.length ? meta.missedTerms : undefined;

  if (candidates.length === 0) {
    return {
      ok: false,
      query,
      queryTerms,
      missedTerms,
      message:
        "No match; broaden query with | synonyms and * wildcards, or use qkrpc_action_query / quicker_settings search.",
    };
  }

  const top = candidates[0]!;
  const directEligible = isLauncherResolveDirectEligible(candidates);
  const next = directEligible ? candidateToNextStep(top) : null;
  if (!next && !candidateToNextStep(top)) {
    return {
      ok: false,
      query,
      queryTerms,
      missedTerms,
      message: "Top match has no executable tool step.",
    };
  }

  const topMatch = buildMatch(top);
  const output: LauncherResolveAgentOutput = {
    ok: true,
    query,
    queryTerms,
    missedTerms,
    ...(next ? { next } : { disambiguationRequired: true }),
    ranked: candidates.slice(0, 5).map((candidate) => ({
      kind: candidate.kind,
      label: buildLabel(candidate),
      score: candidate.score,
      match: buildMatch(candidate),
    })),
    message: directEligible
      ? topMatch
        ? `Execute next.tool (${topMatch.term} → ${topMatch.on}).`
        : `Execute next.tool with next.input (${buildLabel(top)}).`
      : "Low confidence or ambiguous — use ask_question with ranked options; do NOT auto-run.",
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
        match: step.match,
      });
    }
    if (alternatives.length > 0) {
      output.alternatives = alternatives;
      output.message =
        "Top match is close to alternatives — check match.term/match.on; prefer next unless user intent clearly differs.";
    }
  }

  if (missedTerms?.length) {
    output.message = `${output.message ?? ""} Missed terms: ${missedTerms.join(", ")}.`.trim();
  }

  return output;
}
