/**
 * Run one authoring benchmark task via Cursor SDK + qkrpc MCP.
 *
 *   npm run benchmark -- discover-step-expr
 *   npm run benchmark -- discover-step-expr --json
 */
import { requireApiKey } from "./config.js";
import { loadTask } from "./benchmark-catalog.js";
import { runBenchmarkTask } from "./benchmark-run.js";

function parseArgs(argv: string[]): {
  taskId: string;
  json: boolean;
  verifyMock: boolean;
} {
  const positional = argv.filter((a) => !a.startsWith("-"));
  const taskId = positional[0];
  if (!taskId) {
    throw new Error("Usage: npm run benchmark -- <task-id> [--json] [--verify-mock]");
  }
  return {
    taskId,
    json: argv.includes("--json"),
    verifyMock: argv.includes("--verify-mock"),
  };
}

async function main(): Promise<void> {
  const { taskId, json, verifyMock } = parseArgs(process.argv.slice(2));
  requireApiKey();
  const task = loadTask(taskId);

  console.error(
    `cursor-sdk benchmark: task=${task.id} tier=${task.tier} readOnly=${Boolean(task.readOnly)}`,
  );

  const payload = await runBenchmarkTask(task, { json, verifyMock });

  if (json) {
    console.log(
      JSON.stringify(
        {
          taskId: payload.taskId,
          tier: payload.tier,
          status: payload.status,
          requestId: payload.requestId,
          durationMs: payload.durationMs,
          result: payload.result,
          toolCalls: payload.toolCalls,
          mockVerify: payload.mockVerify,
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`\n---\nwritten ${payload.outPath}`);
    console.error(`status=${payload.status} tools=${payload.toolCalls.length}`);
  }

  if (payload.status !== "finished") {
    process.exitCode = 1;
  } else if (verifyMock && payload.mockVerify && !payload.mockVerify.ok) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
