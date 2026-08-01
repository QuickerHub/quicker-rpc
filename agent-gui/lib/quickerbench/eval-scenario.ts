import type { AgentEvalScenario } from "@/lib/agent-eval/eval-scenario";
import type { QuickerBenchTask } from "./catalog";

export function quickerBenchTaskToEvalScenario(  task: QuickerBenchTask,
): AgentEvalScenario {
  return {
    id: task.id,
    label: task.label,
    userPrompt: task.userPrompt,
    chatMode: "agent",
    tier: task.tier,
    category: task.category,
    fixture: "bench-empty",
    expect: {},
    source: "quickerbench",
  };
}
