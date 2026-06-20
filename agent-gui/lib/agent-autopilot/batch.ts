import type { AgentAutopilotRunOptions, AgentAutopilotRunResult } from "@/lib/agent-autopilot/run-loop";
import { runAgentAutopilotScenario } from "@/lib/agent-autopilot/run-loop";
import { loadEvalScenario, resolveEvalScenarioIds } from "@/lib/agent-eval/eval-scenario";

/** QuickerBench core task — sole live regression target until new tasks are added. */
export const AUTOPILOT_CORE_SCENARIO_IDS = [
  "user-action-likes-total",
] as const;

export type AgentAutopilotBatchOptions = AgentAutopilotRunOptions & {
  scenarioIds: readonly string[];
  applyHints?: boolean;
};

export type AgentAutopilotBatchResult = {
  passed: number;
  failed: number;
  results: AgentAutopilotRunResult[];
};

export function resolveAutopilotScenarioIds(options: {
  ids?: string[];
  preset?: string;
  limit?: number;
}): string[] {
  if (options.preset === "autopilot-core") {
    const ids = [...AUTOPILOT_CORE_SCENARIO_IDS];
    const limit = options.limit ?? ids.length;
    return ids.slice(0, limit);
  }
  if (options.ids?.length) {
    for (const id of options.ids) {
      loadEvalScenario(id);
    }
    const limit = options.limit ?? options.ids.length;
    return options.ids.slice(0, limit);
  }
  throw new Error(
    "Specify scenario ids or --preset autopilot-core",
  );
}

export async function runAgentAutopilotBatch(
  options: AgentAutopilotBatchOptions,
): Promise<AgentAutopilotBatchResult> {
  const results: AgentAutopilotRunResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const scenarioId of options.scenarioIds) {
    const result = await runAgentAutopilotScenario(scenarioId, {
      baseUrl: options.baseUrl,
      llmSelection: options.llmSelection,
      outDir: options.outDir,
      applyHints: options.applyHints,
      skipProbe: options.skipProbe,
    });
    results.push(result);
    if (result.tracePassed && result.chatOk) {
      passed += 1;
    } else {
      failed += 1;
    }
  }

  return { passed, failed, results };
}
