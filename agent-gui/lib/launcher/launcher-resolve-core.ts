import { formatQkrpcResultForAgent, runQkrpcForTool } from "@/lib/qkrpc";
import { invokeQkrpcHttp } from "@/lib/qkrpc-http";
import {
  applyLauncherResolvePresets,
  DEFAULT_LAUNCHER_RESOLVE_PRESETS,
  mergeLauncherResolvePresets,
  type LauncherResolveCandidate,
  type LauncherResolvePresetsFile,
} from "@/lib/launcher/launcher-resolve-presets";

export type LauncherResolveToolInput = {
  query: string;
  scopes?: Array<"settings" | "actions" | "subprograms">;
  limit?: number;
  /** Skip user preset boosts from `.local/launcher-resolve-presets.json`. */
  skipPresets?: boolean;
};

type RpcCandidate = {
  kind?: string;
  score?: number;
  title?: string;
  subtitle?: string | null;
  intent?: string | null;
  pageId?: string | null;
  presetId?: string | null;
  settingKey?: string | null;
  actionId?: string | null;
  subProgramId?: string | null;
  target?: string | null;
  suggestedTool?: string | null;
  suggestedInput?: Record<string, unknown> | null;
  reason?: string | null;
  matchedQueryTerm?: string | null;
  matchedOn?: string | null;
};

type RpcResolvePayload = {
  candidates?: RpcCandidate[];
  queryTerms?: string[];
  missedTerms?: string[];
};

function mapCandidate(raw: RpcCandidate): LauncherResolveCandidate {
  return {
    kind: raw.kind ?? "unknown",
    score: typeof raw.score === "number" ? raw.score : 0,
    title: raw.title ?? "",
    subtitle: raw.subtitle,
    intent: raw.intent,
    pageId: raw.pageId,
    presetId: raw.presetId,
    settingKey: raw.settingKey,
    actionId: raw.actionId,
    subProgramId: raw.subProgramId,
    target: raw.target,
    suggestedTool: raw.suggestedTool,
    suggestedInput: raw.suggestedInput ?? null,
    reason: raw.reason,
    matchedQueryTerm: raw.matchedQueryTerm,
    matchedOn: raw.matchedOn,
  };
}

function parseSuggestedInputJson(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function normalizeRpcCandidates(raw: RpcCandidate[]): LauncherResolveCandidate[] {
  return raw.map((item) => {
    const mapped = mapCandidate(item);
    if (
      (!mapped.suggestedInput || Object.keys(mapped.suggestedInput).length === 0)
      && item.suggestedInput == null
      && "SuggestedInputJson" in item
    ) {
      const fromJson = parseSuggestedInputJson(
        (item as { SuggestedInputJson?: string }).SuggestedInputJson,
      );
      if (fromJson) mapped.suggestedInput = fromJson;
    }
    return mapped;
  });
}

export type LauncherResolveCoreResult =
  | {
      ok: true;
      query: string;
      queryTerms: string[];
      missedTerms: string[];
      candidates: LauncherResolveCandidate[];
    }
  | { ok: false; query: string; error: string };

export async function resolveLauncherCandidates(
  input: LauncherResolveToolInput,
  userPresets: LauncherResolvePresetsFile | null,
): Promise<LauncherResolveCoreResult> {
  const query = input.query.trim();
  if (!query) {
    return { ok: false, query: "", error: "query is required" };
  }

  const limit = input.limit ?? 8;
  const scopes = input.scopes?.length ? input.scopes.join(",") : undefined;

  const http = await invokeQkrpcHttp({
    op: "launcher.resolve",
    args: { query, limit, scopes },
  });

  const base =
    http
    ?? (await runQkrpcForTool([
      "launcher",
      "resolve",
      "--query",
      query,
      "--limit",
      String(limit),
      ...(scopes ? ["--scopes", scopes] : []),
    ]));

  const formatted = formatQkrpcResultForAgent(base);
  if (!formatted.ok) {
    const err =
      typeof formatted.stderr === "string"
        ? formatted.stderr
        : "launcher resolve failed";
    return { ok: false, query, error: err };
  }

  const payload = (formatted.data ?? formatted.parsed) as RpcResolvePayload | null;

  let candidates = normalizeRpcCandidates(payload?.candidates ?? []);
  const queryTerms = payload?.queryTerms?.length
    ? payload.queryTerms
    : LauncherQueryParser.parseAlternatives(query);
  const missedTerms = payload?.missedTerms ?? [];

  if (!input.skipPresets) {
    const merged = mergeLauncherResolvePresets(
      DEFAULT_LAUNCHER_RESOLVE_PRESETS,
      userPresets,
    );
    candidates = applyLauncherResolvePresets(query, candidates, merged);
  }

  return { ok: true, query, queryTerms, missedTerms, candidates };
}

/** Client-side fallback when RPC payload lacks parsed terms. */
export const LauncherQueryParser = {
  parseAlternatives(raw: string): string[] {
    return raw
      .split("|")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  },
};
