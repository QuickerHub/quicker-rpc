import type { AgentEvalScenario } from "@/lib/agent-eval/eval-scenario";
import type { QuickerBenchTask } from "./catalog";
import { resolveQuickerBenchMockProfile } from "./catalog";

export function quickerBenchTaskToEvalScenario(  task: QuickerBenchTask,
): AgentEvalScenario {
  return {
    id: task.id,
    label: task.label,
    userPrompt: task.userPrompt,
    chatMode: "agent",
    tier: task.tier,
    category: task.category,
    mockProfile: resolveQuickerBenchMockProfile(task),
    fixture: "bench-empty",
    expect: {},
    source: "quickerbench",
  };
}
