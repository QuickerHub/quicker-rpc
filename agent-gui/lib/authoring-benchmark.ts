import benchmarkData from "@/benchmarks/authoring-tasks.json";

export type AuthoringBenchmarkAxisId = "A" | "B" | "C" | "D" | "E" | "F";

export type AuthoringBenchmarkTier = "L0" | "L1" | "L2" | "L3" | "L4";

export type AuthoringBenchmarkCategory =
  | "discover"
  | "authoring"
  | "workspace"
  | "subprogram"
  | "regression"
  | "org";

export type AuthoringBenchmarkRubric = {
  must?: string[];
  should?: string[];
  mustNot?: string[];
};

export type AuthoringBenchmarkVerify = {
  manual?: string[];
  auto?: string[];
  /** Mock profile id under agent-gui/benchmarks/mock-profiles/ */
  mockProfile?: string;
};

export type AuthoringBenchmarkTask = {
  id: string;
  tier: AuthoringBenchmarkTier;
  category: AuthoringBenchmarkCategory;
  label: string;
  hint: string;
  readOnly?: boolean;
  prerequisites?: string[];
  axes: AuthoringBenchmarkAxisId[];
  userPrompt: string;
  rubric: AuthoringBenchmarkRubric;
  verify?: AuthoringBenchmarkVerify;
};

export type AuthoringBenchmarkAxis = {
  id: AuthoringBenchmarkAxisId;
  name: string;
  weight: number;
  description: string;
};

export type AuthoringBenchmarkCatalog = {
  version: number;
  title: string;
  description: string;
  axes: Record<AuthoringBenchmarkAxisId, AuthoringBenchmarkAxis>;
  tiers: Record<AuthoringBenchmarkTier, string>;
  passThresholds: {
    overallPercent: number;
    l2CorePercent: number;
    note?: string;
  };
  tasks: AuthoringBenchmarkTask[];
};

/** Score per axis: 0 fail, 1 partial, 2 pass. */
export type AuthoringBenchmarkAxisScore = Record<AuthoringBenchmarkAxisId, 0 | 1 | 2>;

export type AuthoringBenchmarkTaskResult = {
  taskId: string;
  scores: Partial<AuthoringBenchmarkAxisScore>;
  notes?: string;
};

const catalog = benchmarkData as AuthoringBenchmarkCatalog;

export const AUTHORING_BENCHMARK_CATALOG: AuthoringBenchmarkCatalog = catalog;

export const AUTHORING_BENCHMARK_TASKS: readonly AuthoringBenchmarkTask[] =
  catalog.tasks;

export const AUTHORING_BENCHMARK_AXIS_ORDER: readonly AuthoringBenchmarkAxisId[] =
  ["A", "B", "C", "D", "E", "F"] as const;

export const AUTHORING_BENCHMARK_TIER_ORDER: readonly AuthoringBenchmarkTier[] =
  ["L0", "L1", "L2", "L3", "L4"] as const;

export const AUTHORING_BENCHMARK_CATEGORY_ORDER: readonly AuthoringBenchmarkCategory[] =
  [
    "discover",
    "authoring",
    "workspace",
    "subprogram",
    "regression",
    "org",
  ] as const;

export const AUTHORING_BENCHMARK_CATEGORY_LABELS: Record<
  AuthoringBenchmarkCategory,
  string
> = {
  discover: "发现（L0 只读）",
  authoring: "编写",
  workspace: "工作区磁盘",
  subprogram: "子程序",
  regression: "流程回归",
  org: "整理 / 检索",
};

export function getAuthoringBenchmarkTask(
  id: string,
): AuthoringBenchmarkTask | undefined {
  return catalog.tasks.find((t) => t.id === id);
}

export function listAuthoringBenchmarkTasksByTier(
  tier: AuthoringBenchmarkTier,
): AuthoringBenchmarkTask[] {
  return catalog.tasks.filter((t) => t.tier === tier);
}

export function listAuthoringBenchmarkTasksByCategory(
  category: AuthoringBenchmarkCategory,
): AuthoringBenchmarkTask[] {
  return catalog.tasks.filter((t) => t.category === category);
}

export function groupAuthoringBenchmarkTasksByCategory(): {
  category: AuthoringBenchmarkCategory;
  label: string;
  items: AuthoringBenchmarkTask[];
}[] {
  const byCat = new Map<AuthoringBenchmarkCategory, AuthoringBenchmarkTask[]>();
  for (const task of catalog.tasks) {
    const list = byCat.get(task.category) ?? [];
    list.push(task);
    byCat.set(task.category, list);
  }
  return AUTHORING_BENCHMARK_CATEGORY_ORDER.filter((c) => byCat.has(c)).map(
    (category) => ({
      category,
      label: AUTHORING_BENCHMARK_CATEGORY_LABELS[category],
      items: byCat.get(category)!,
    }),
  );
}

/** L2 tasks excluding pure regression — core authoring orchestration. */
export function listAuthoringBenchmarkL2CoreTasks(): AuthoringBenchmarkTask[] {
  return catalog.tasks.filter(
    (t) => t.tier === "L2" && t.category !== "regression",
  );
}

/** Resolve mock profile id from task verify block; defaults to task id. */
export function resolveMockProfileId(task: AuthoringBenchmarkTask): string {
  const explicit = task.verify?.mockProfile?.trim();
  return explicit && explicit.length > 0 ? explicit : task.id;
}

/** Tasks that declare a mock profile for F-axis automated verify. */
export function listAuthoringBenchmarkTasksWithMockProfile(): AuthoringBenchmarkTask[] {
  return catalog.tasks.filter(
    (t) =>
      typeof t.verify?.mockProfile === "string"
      && t.verify.mockProfile.trim().length > 0,
  );
}

/**
 * Weighted score for one task (0–100) from axis scores on axes the task uses.
 */
export function scoreAuthoringBenchmarkTask(
  task: AuthoringBenchmarkTask,
  scores: Partial<AuthoringBenchmarkAxisScore>,
): number {
  let weightSum = 0;
  let earned = 0;
  for (const axisId of task.axes) {
    const axis = catalog.axes[axisId];
    if (!axis) continue;
    const raw = scores[axisId];
    const normalized = raw === undefined ? 0 : raw / 2;
    weightSum += axis.weight;
    earned += axis.weight * normalized;
  }
  if (weightSum <= 0) return 0;
  return Math.round((earned / weightSum) * 100);
}

export type AuthoringBenchmarkSummary = {
  taskCount: number;
  overallPercent: number;
  l2CorePercent: number;
  passOverall: boolean;
  passL2Core: boolean;
};

export function summarizeAuthoringBenchmarkResults(
  results: AuthoringBenchmarkTaskResult[],
): AuthoringBenchmarkSummary {
  const byId = new Map(results.map((r) => [r.taskId, r]));
  let overallSum = 0;
  let overallN = 0;
  for (const task of catalog.tasks) {
    const result = byId.get(task.id);
    if (!result) continue;
    overallSum += scoreAuthoringBenchmarkTask(task, result.scores);
    overallN += 1;
  }
  const overallPercent =
    overallN === 0 ? 0 : Math.round(overallSum / overallN);

  const l2Core = listAuthoringBenchmarkL2CoreTasks();
  let l2Sum = 0;
  let l2N = 0;
  for (const task of l2Core) {
    const result = byId.get(task.id);
    if (!result) continue;
    l2Sum += scoreAuthoringBenchmarkTask(task, result.scores);
    l2N += 1;
  }
  const l2CorePercent = l2N === 0 ? 0 : Math.round(l2Sum / l2N);

  const { overallPercent: passOverallAt, l2CorePercent: passL2At } =
    catalog.passThresholds;

  return {
    taskCount: overallN,
    overallPercent,
    l2CorePercent,
    passOverall: overallPercent >= passOverallAt,
    passL2Core: l2CorePercent >= passL2At,
  };
}

/** Markdown scoring sheet for copy into notes / spreadsheet. */
export function formatAuthoringBenchmarkScoringSheet(): string {
  const header = [
    "| task id | tier | A | B | C | D | E | F | % | notes |",
    "|---------|------|---|---|---|---|---|---|---|-------|",
  ];
  const rows = catalog.tasks.map((t) => {
    const axes = AUTHORING_BENCHMARK_AXIS_ORDER.map((a) =>
      t.axes.includes(a) ? " " : "—",
    ).join(" | ");
    return `| ${t.id} | ${t.tier} | ${axes} | | |`;
  });
  return [...header, ...rows].join("\n");
}
