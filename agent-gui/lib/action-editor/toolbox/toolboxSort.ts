/** Idle sort for the all-modules toolbox. Search always ranks by server match first. */
export type ToolboxSortMode = "recommend" | "name" | "useCount";

export const TOOLBOX_SORT_MODE_RECOMMEND: ToolboxSortMode = "recommend";
export const TOOLBOX_SORT_MODE_NAME: ToolboxSortMode = "name";
export const TOOLBOX_SORT_MODE_USE_COUNT: ToolboxSortMode = "useCount";

export const TOOLBOX_SORT_OPTIONS: ReadonlyArray<{ id: ToolboxSortMode; label: string }> = [
  { id: "recommend", label: "综合排序" },
  { id: "name", label: "按名称排序" },
  { id: "useCount", label: "按使用次数排序" },
];

const GLOBAL_COUNT_CAP = 10_000;
const FAVORITE_TIER = 500_000_000;
const RECENT_TIER_BASE = 1_000_000_000;
const RECENT_TIER_STEP = 10_000_000;
const BUILTIN_TIER_BASE = 10_000;

/** Same built-in common keys as Headless QuickInsert recommendation. */
export const TOOLBOX_BUILTIN_COMMON_KEYS = [
  "sys:assign",
  "sys:if",
  "sys:elseif",
  "sys:else",
  "sys:repeat",
  "sys:subprogram",
  "sys:comment",
  "sys:toast",
  "sys:msgbox",
] as const;

const BUILTIN_RANK = new Map<string, number>(TOOLBOX_BUILTIN_COMMON_KEYS.map((key, index) => [key, index]));

export type ToolboxSortableNode = {
  key: string;
  name: string;
  useCount?: number;
};

export type ToolboxSortSignals = {
  favoriteKeys?: ReadonlySet<string>;
  useCounts?: ReadonlyMap<string, number>;
  recentPickIds?: readonly string[];
};

export function normalizeToolboxSortMode(value: string | null | undefined): ToolboxSortMode {
  if (value === "name" || value === "Name") {
    return "name";
  }
  if (value === "useCount" || value === "UseCount") {
    return "useCount";
  }
  return "recommend";
}

/** Host / AccountLocalState casing used by WPF `ToolboxModuleRank`. */
export function toHostToolboxSortMode(mode: ToolboxSortMode): "Recommend" | "Name" | "UseCount" {
  if (mode === "name") {
    return "Name";
  }
  if (mode === "useCount") {
    return "UseCount";
  }
  return "Recommend";
}

export function toolboxSortModeLabel(mode: ToolboxSortMode): string {
  return TOOLBOX_SORT_OPTIONS.find((option) => option.id === mode)?.label ?? "综合排序";
}

export function computeToolboxRecommendScore(
  key: string,
  signals: ToolboxSortSignals | undefined,
): number {
  const runnerKey = key.trim();
  if (!runnerKey) {
    return 0;
  }

  let score = 0;
  const recentIndex = indexOfRecentPick(runnerKey, signals?.recentPickIds);
  if (recentIndex >= 0) {
    score += RECENT_TIER_BASE - recentIndex * RECENT_TIER_STEP;
  }
  if (signals?.favoriteKeys?.has(runnerKey)) {
    score += FAVORITE_TIER;
  }
  const useCount = signals?.useCounts?.get(runnerKey) ?? 0;
  if (useCount > 0) {
    score += Math.min(useCount, GLOBAL_COUNT_CAP);
  }
  const builtinRank = BUILTIN_RANK.get(runnerKey);
  if (builtinRank != null) {
    score += BUILTIN_TIER_BASE * (TOOLBOX_BUILTIN_COMMON_KEYS.length - builtinRank);
  }
  return score;
}

export function compareToolboxNodes(
  a: ToolboxSortableNode,
  b: ToolboxSortableNode,
  mode: ToolboxSortMode,
  signals?: ToolboxSortSignals,
): number {
  if (mode === "useCount") {
    const countCmp = useCountOf(b, signals) - useCountOf(a, signals);
    if (countCmp !== 0) {
      return countCmp;
    }
    return a.name.localeCompare(b.name, "zh-CN");
  }
  if (mode === "name") {
    return a.name.localeCompare(b.name, "zh-CN");
  }
  const scoreCmp =
    computeToolboxRecommendScore(b.key, signals) - computeToolboxRecommendScore(a.key, signals);
  if (scoreCmp !== 0) {
    return scoreCmp;
  }
  return a.name.localeCompare(b.name, "zh-CN");
}

export function sortToolboxNodes<T extends ToolboxSortableNode>(
  nodes: readonly T[],
  mode: ToolboxSortMode,
  signals?: ToolboxSortSignals,
): T[] {
  return [...nodes].sort((a, b) => compareToolboxNodes(a, b, mode, signals));
}

function useCountOf(node: ToolboxSortableNode, signals: ToolboxSortSignals | undefined): number {
  return signals?.useCounts?.get(node.key) ?? node.useCount ?? 0;
}

function indexOfRecentPick(runnerKey: string, recentPickIds: readonly string[] | undefined): number {
  if (!recentPickIds || recentPickIds.length === 0) {
    return -1;
  }
  const rowId = `r:${runnerKey}`;
  for (let i = 0; i < recentPickIds.length; i++) {
    const id = recentPickIds[i];
    if (id === rowId || id === runnerKey) {
      return i;
    }
  }
  return -1;
}
