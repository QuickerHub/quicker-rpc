import { normalizeLauncherCommandPhrase } from "@/lib/launcher/launcher-command-cache-core";

export type LauncherResolveCandidate = {
  kind: string;
  score: number;
  title: string;
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
  presetBoost?: number;
  presetRuleId?: string;
};

export type LauncherResolvePresetRule = {
  id: string;
  /** When user query contains any of these phrases (normalized), apply boosts. */
  whenQueryContains?: string[];
  /** Additive score by candidate kind. */
  boostKinds?: Partial<Record<string, number>>;
  /** Penalize kinds (negative values). */
  penalizeKinds?: Partial<Record<string, number>>;
  /** Boost specific targets when kind + id field match. */
  boostTargets?: Array<{
    kind: string;
    pageId?: string;
    presetId?: string;
    actionId?: string;
    subProgramId?: string;
    settingKey?: string;
    boost: number;
  }>;
};

export type LauncherResolvePresetsFile = {
  version?: number;
  rules?: LauncherResolvePresetRule[];
};

/** Built-in defaults; overridden/extended by `.local/launcher-resolve-presets.json`. */
export const DEFAULT_LAUNCHER_RESOLVE_PRESETS: LauncherResolvePresetsFile = {
  version: 1,
  rules: [
    {
      id: "prefer-settings-ui",
      whenQueryContains: ["设置", "打开", "界面", "选项"],
      boostKinds: {
        "settings-intent": 30,
        "settings-preset": 25,
        "settings-page": 20,
      },
      penalizeKinds: {
        action: -15,
        subprogram: -10,
      },
    },
    {
      id: "prefer-run-action",
      whenQueryContains: ["运行", "执行", "启动动作", "跑一下"],
      boostKinds: {
        action: 40,
      },
      penalizeKinds: {
        "settings-page": -20,
      },
    },
    {
      id: "prefer-subprogram",
      whenQueryContains: ["子程序", "公共子程序"],
      boostKinds: {
        subprogram: 45,
      },
    },
  ],
};

function queryMatchesRule(query: string, rule: LauncherResolvePresetRule): boolean {
  const phrases = rule.whenQueryContains ?? [];
  if (phrases.length === 0) return true;
  const q = normalizeLauncherCommandPhrase(query);
  if (!q) return false;
  return phrases.some((phrase) => {
    const p = normalizeLauncherCommandPhrase(phrase);
    return p.length > 0 && (q.includes(p) || p.includes(q));
  });
}

function targetMatches(
  candidate: LauncherResolveCandidate,
  target: NonNullable<LauncherResolvePresetRule["boostTargets"]>[number],
): boolean {
  if (candidate.kind !== target.kind) return false;
  if (target.pageId && candidate.pageId !== target.pageId) return false;
  if (target.presetId && candidate.presetId !== target.presetId) return false;
  if (target.actionId && candidate.actionId !== target.actionId) return false;
  if (target.subProgramId && candidate.subProgramId !== target.subProgramId) return false;
  if (target.settingKey && candidate.settingKey !== target.settingKey) return false;
  return true;
}

export function applyLauncherResolvePresets(
  query: string,
  candidates: LauncherResolveCandidate[],
  presets: LauncherResolvePresetsFile = DEFAULT_LAUNCHER_RESOLVE_PRESETS,
): LauncherResolveCandidate[] {
  const rules = presets.rules ?? [];
  if (rules.length === 0 || candidates.length === 0) {
    return candidates;
  }

  const adjusted = candidates.map((candidate) => {
    let boost = 0;
    let ruleId: string | undefined;
    for (const rule of rules) {
      if (!queryMatchesRule(query, rule)) continue;
      boost += rule.boostKinds?.[candidate.kind] ?? 0;
      boost += rule.penalizeKinds?.[candidate.kind] ?? 0;
      for (const target of rule.boostTargets ?? []) {
        if (targetMatches(candidate, target)) {
          boost += target.boost;
        }
      }
      if (!ruleId) ruleId = rule.id;
    }
    if (boost === 0) return candidate;
    return {
      ...candidate,
      score: candidate.score + boost,
      presetBoost: boost,
      presetRuleId: ruleId,
    };
  });

  return [...adjusted].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title, "zh-CN");
  });
}

export function mergeLauncherResolvePresets(
  base: LauncherResolvePresetsFile,
  override: LauncherResolvePresetsFile | null | undefined,
): LauncherResolvePresetsFile {
  if (!override?.rules?.length) return base;
  const byId = new Map<string, LauncherResolvePresetRule>();
  for (const rule of base.rules ?? []) {
    byId.set(rule.id, rule);
  }
  for (const rule of override.rules) {
    byId.set(rule.id, { ...byId.get(rule.id), ...rule });
  }
  return { version: override.version ?? base.version, rules: [...byId.values()] };
}
