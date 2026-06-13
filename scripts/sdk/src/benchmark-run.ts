import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SDKAgent } from "@cursor/sdk";
import { wrapBenchmarkPrompt } from "./benchmark-prompt.js";
import {
  extractActionIdFromBenchmarkResult,
  parseMockRunJson,
  runMockVerify,
} from "./benchmark-mock-verify.js";
import { REPO_ROOT } from "./config.js";
import { createQuickerRpcAgent } from "./create-agent.js";
import { logStreamEvent } from "./stream-log.js";
import { loadTask, resolveMockProfileId, type BenchmarkTask } from "./benchmark-catalog.js";

export type BenchmarkRunPayload = {
  taskId: string;
  tier: string;
  status: string;
  requestId?: string;
  durationMs: number;
  result: string;
  toolCalls: Array<{ name: string; status: string }>;
  outPath: string;
  mockVerify?: {
    ok: boolean;
    actionId?: string;
    profileId: string;
    report?: { ok?: boolean; assertions?: { passed?: boolean } };
  };
};

export async function runBenchmarkTask(
  task: BenchmarkTask,
  options: { json?: boolean; agent?: SDKAgent; verifyMock?: boolean } = {},
): Promise<BenchmarkRunPayload> {
  const startedAt = Date.now();
  const toolCalls: Array<{ name: string; status: string }> = [];
  const ownsAgent = !options.agent;
  const agent =
    options.agent ??
    (await createQuickerRpcAgent({ name: `benchmark-${task.id}` }));

  try {
    const run = await agent.send(wrapBenchmarkPrompt(task.userPrompt));
    for await (const event of run.stream()) {
      if (event.type === "tool_call") {
        toolCalls.push({ name: event.name, status: event.status });
      }
      if (!options.json) {
        logStreamEvent(event);
      }
    }
    const result = await run.wait();
    const outDir = join(REPO_ROOT, ".local", "cursor-sdk");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `${task.id}-${Date.now()}.json`);

    const payload: BenchmarkRunPayload = {
      taskId: task.id,
      tier: task.tier,
      status: result.status,
      requestId: result.requestId,
      durationMs: Date.now() - startedAt,
      result: result.result ?? "",
      toolCalls,
      outPath,
    };

    if (options.verifyMock && !task.readOnly) {
      const actionId = extractActionIdFromBenchmarkResult(payload.result);
      if (actionId) {
        const mock = runMockVerify({
          actionId,
          mockProfile: resolveMockProfileId(task),
        });
        payload.mockVerify = {
          ok: mock.ok,
          actionId,
          profileId: resolveMockProfileId(task),
        };
      }
    }

    writeFileSync(
      outPath,
      `${JSON.stringify(
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
      )}\n`,
      "utf8",
    );

    return payload;
  } finally {
    if (ownsAgent) {
      await agent[Symbol.asyncDispose]();
    }
  }
}
