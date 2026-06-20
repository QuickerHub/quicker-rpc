import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  QUICKERBENCH_CORE_TASK_IDS,
  type FixtureManifest,
  type QuickerBenchCatalog,
  type QuickerBenchTask,
} from "@/lib/quickerbench/catalog-types";

export type {
  FixtureManifest,
  QuickerBenchCatalog,
  QuickerBenchIoContract,
  QuickerBenchIoField,
  QuickerBenchTask,
} from "@/lib/quickerbench/catalog-types";
export { QUICKERBENCH_CORE_TASK_IDS } from "@/lib/quickerbench/catalog-types";

const CATALOG_PATH = join(process.cwd(), "benchmarks", "quickerbench-tasks.json");

export function loadQuickerBenchCatalog(
  catalogPath: string = CATALOG_PATH,
): QuickerBenchCatalog {
  return JSON.parse(readFileSync(catalogPath, "utf8")) as QuickerBenchCatalog;
}

export function loadQuickerBenchTask(
  taskId: string,
  catalogPath?: string,
): QuickerBenchTask {
  const catalog = loadQuickerBenchCatalog(catalogPath);
  const task = catalog.tasks.find((t) => t.id === taskId);
  if (!task) {
    const examples = catalog.tasks.map((t) => t.id).slice(0, 6).join(", ");
    throw new Error(`Unknown QuickerBench task "${taskId}". Examples: ${examples}, …`);
  }
  return task;
}

export function resolveQuickerBenchTaskIds(options: {
  ids?: string[];
  tier?: string;
  preset?: string;
  limit?: number;
  catalogPath?: string;
}): string[] {
  const catalog = loadQuickerBenchCatalog(options.catalogPath);
  let ids: string[];

  if (options.preset === "quickerbench-core") {
    ids = [...QUICKERBENCH_CORE_TASK_IDS];
  } else if (options.ids?.length) {
    ids = options.ids;
  } else if (options.tier) {
    ids = catalog.tasks.filter((t) => t.tier === options.tier).map((t) => t.id);
  } else {
    throw new Error(
      "Specify task ids, --tier, or --preset quickerbench-core",
    );
  }

  for (const id of ids) {
    loadQuickerBenchTask(id, options.catalogPath);
  }

  const limit = options.limit ?? ids.length;
  return ids.slice(0, limit);
}

export function resolveQuickerBenchMockProfile(task: QuickerBenchTask): string {
  return task.verify.mockProfile.trim() || task.id;
}

export function loadFixtureManifest(fixtureSet: string): FixtureManifest {
  const manifestPath = join(
    process.cwd(),
    "benchmarks",
    "quickerbench-fixtures",
    fixtureSet,
    "manifest.json",
  );
  return JSON.parse(readFileSync(manifestPath, "utf8")) as FixtureManifest;
}

export function syncTaskOracleFromManifest(task: QuickerBenchTask): QuickerBenchTask {
  if (!task.oracle.fixtureSet) return task;
  const manifest = loadFixtureManifest(task.oracle.fixtureSet);
  return {
    ...task,
    oracle: {
      ...task.oracle,
      outputVars: {
        totalLikes: manifest.oracle.totalLikes,
        actionCount: manifest.oracle.actionCount,
      },
      snapshot: {
        capturedAt: manifest.capturedAt,
        note: `Fixture ${task.oracle.fixtureSet}; ${manifest.parsedCount} actions parsed.`,
      },
    },
  };
}
