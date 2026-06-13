import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./config.js";

export type BenchmarkTask = {
  id: string;
  tier: string;
  category?: string;
  userPrompt: string;
  readOnly?: boolean;
  label?: string;
  verify?: {
    mockProfile?: string;
    manual?: string[];
    auto?: string[];
  };
};

export type BenchmarkCatalog = {
  tasks: BenchmarkTask[];
};

const CATALOG_PATH = join(
  REPO_ROOT,
  "agent-gui",
  "benchmarks",
  "authoring-tasks.json",
);

export function loadCatalog(): BenchmarkCatalog {
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as BenchmarkCatalog;
}

export function loadTask(taskId: string): BenchmarkTask {
  const catalog = loadCatalog();
  const task = catalog.tasks.find((t) => t.id === taskId);
  if (!task) {
    const ids = catalog.tasks.map((t) => t.id).slice(0, 8).join(", ");
    throw new Error(`Unknown task "${taskId}". Examples: ${ids}, …`);
  }
  return task;
}

/** L2 authoring core tasks from docs/agent-authoring-benchmark.md */
export const L2_CORE_TASK_IDS = [
  "clip-lines-expr",
  "multi-var-assign",
  "http-json-origin",
  "window-vscode-branch",
  "form-to-clipboard",
  "file-copy-timestamp",
  "read-structure-first",
] as const;

export function resolveTaskIds(options: {
  ids?: string[];
  tier?: string;
  preset?: string;
  limit?: number;
}): string[] {
  const catalog = loadCatalog();
  let ids: string[];

  if (options.preset === "l2-core") {
    ids = [...L2_CORE_TASK_IDS];
  } else if (options.ids?.length) {
    ids = options.ids;
  } else if (options.tier) {
    ids = catalog.tasks
      .filter((t) => t.tier === options.tier)
      .map((t) => t.id);
  } else {
    throw new Error("Specify task ids, --tier, or --preset l2-core");
  }

  for (const id of ids) {
    loadTask(id);
  }

  const limit = options.limit ?? ids.length;
  return ids.slice(0, limit);
}

/** Default mock profile id equals task id when `agent-gui/benchmarks/mock-profiles/<id>.json` exists. */
export function resolveMockProfileId(task: BenchmarkTask): string {
  return task.verify?.mockProfile?.trim() || task.id;
}
