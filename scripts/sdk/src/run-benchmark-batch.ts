/**
 * Run multiple authoring benchmark tasks sequentially.
 *
 *   npm run benchmark:batch -- --preset l2-core --limit 1
 *   npm run benchmark:batch -- clip-lines-expr multi-var-assign
 *   npm run benchmark:batch -- --tier L0 --limit 3 --json
 */
import { requireApiKey } from "./config.js";
import { loadTask, resolveTaskIds } from "./benchmark-catalog.js";
import { runBenchmarkTask, type BenchmarkRunPayload } from "./benchmark-run.js";

function parseArgs(argv: string[]): {
  ids?: string[];
  tier?: string;
  preset?: string;
  limit?: number;
  json: boolean;
} {
  const json = argv.includes("--json");
  const tierIdx = argv.indexOf("--tier");
  const tier =
    tierIdx >= 0 ? argv[tierIdx + 1] : undefined;
  const presetIdx = argv.indexOf("--preset");
  const preset =
    presetIdx >= 0 ? argv[presetIdx + 1] : undefined;
  const limitIdx = argv.indexOf("--limit");
  const limit =
    limitIdx >= 0 ? Number(argv[limitIdx + 1]) : undefined;
  const ids = argv.filter(
    (a) =>
      !a.startsWith("-") &&
      a !== tier &&
      a !== preset &&
      a !== String(limit),
  );

  return {
    ids: ids.length ? ids : undefined,
    tier,
    preset,
    limit: Number.isFinite(limit) ? limit : undefined,
    json,
  };
}

async function main(): Promise<void> {
  requireApiKey();
  const args = parseArgs(process.argv.slice(2));
  const taskIds = resolveTaskIds(args);

  console.error(
    `cursor-sdk batch: ${taskIds.length} task(s) [${taskIds.join(", ")}]`,
  );

  const summary: BenchmarkRunPayload[] = [];
  let failed = 0;

  for (const taskId of taskIds) {
    const task = loadTask(taskId);
    console.error(
      `\n=== ${task.id} (${task.tier}) ${task.label ?? ""} ===`,
    );

    const payload = await runBenchmarkTask(task, { json: args.json });
    summary.push(payload);

    if (payload.status !== "finished") {
      failed += 1;
    }

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.error(
        `done status=${payload.status} durationMs=${payload.durationMs} tools=${payload.toolCalls.length}`,
      );
      console.error(`written ${payload.outPath}`);
    }
  }

  console.error(
    `\n--- batch summary: ${summary.length - failed}/${summary.length} finished`,
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
