import "server-only";

import { prepareContextPipeline } from "@/lib/agent-harness/context-pipeline";
import { buildPostCompactReinjectBlock } from "@/lib/context-compaction-reinject.server";
import { recordManagedLlmUsageAsync } from "@/lib/llm-usage-tracker.server";
import { runAgentStreamLoopCore, type AgentStreamLoopParams } from "./stream-loop";

export type { AgentStreamLoopParams } from "./stream-loop";

/** Server bindings; tests pass isolated ports to the same AI SDK loop. */
export function runAgentStreamLoop(params: AgentStreamLoopParams) {
  return runAgentStreamLoopCore(params, {
    recordUsage: recordManagedLlmUsageAsync,
    prepareContext: (options) => prepareContextPipeline({
      ...options,
      reinjectRecentPatches: buildPostCompactReinjectBlock,
    }),
  });
}
