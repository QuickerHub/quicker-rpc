import { readFileSync } from "node:fs";
import { join } from "node:path";

export type AgentEvalBenchmarkTask = {
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

export type AgentEvalBenchmarkCatalog = {
  tasks: AgentEvalBenchmarkTask[];
};

const CATALOG_PATH = join(
  process.cwd(),
  "benchmarks",
  "authoring-tasks.json",
);

export const L2_CORE_TASK_IDS = [
  "clip-lines-expr",
  "multi-var-assign",
  "http-json-origin",
  "window-vscode-branch",
  "form-to-clipboard",
  "file-copy-timestamp",
  "read-structure-first",
] as const;

export function loadBenchmarkCatalog(
  catalogPath: string = CATALOG_PATH,
): AgentEvalBenchmarkCatalog {
  return JSON.parse(readFileSync(catalogPath, "utf8")) as AgentEvalBenchmarkCatalog;
}

export function loadBenchmarkTask(
  taskId: string,
  catalogPath?: string,
): AgentEvalBenchmarkTask {
  const catalog = loadBenchmarkCatalog(catalogPath);
  const task = catalog.tasks.find((t) => t.id === taskId);
  if (!task) {
    const examples = catalog.tasks.map((t) => t.id).slice(0, 8).join(", ");
    throw new Error(`Unknown task "${taskId}". Examples: ${examples}, …`);
  }
  return task;
}

export function resolveBenchmarkTaskIds(options: {
  ids?: string[];
  tier?: string;
  preset?: string;
  limit?: number;
  catalogPath?: string;
}): string[] {
  const catalog = loadBenchmarkCatalog(options.catalogPath);
  let ids: string[];

  if (options.preset === "l2-core") {
    ids = [...L2_CORE_TASK_IDS];
  } else if (options.ids?.length) {
    ids = options.ids;
  } else if (options.tier) {
    ids = catalog.tasks
      .filter((t) => t.tier === options.tier)
      .map((t) => t.id);
  } else if (options.preset === "smoke") {
    ids = ["discover-step-expr"];
  } else {
    throw new Error("Specify task ids, --tier, --preset l2-core, or --preset smoke");
  }

  for (const id of ids) {
    loadBenchmarkTask(id, options.catalogPath);
  }

  const limit = options.limit ?? ids.length;
  return ids.slice(0, limit);
}

export function resolveMockProfileId(task: AgentEvalBenchmarkTask): string {
  return task.verify?.mockProfile?.trim() || task.id;
}
