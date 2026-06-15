import type { AgentEvalScenarioExpect } from "@/lib/agent-eval/eval-scenario";
import { evaluateLauncherExpect } from "@/lib/agent-eval/launcher-expect";
import type { AgentEvalToolCall, AgentEvalTraceRubric } from "@/lib/agent-eval/types";

export function evaluateTraceExpect(
  trace: readonly AgentEvalToolCall[],
  expect?: AgentEvalScenarioExpect,
): AgentEvalTraceRubric {
  const violations: string[] = [];
  if (!expect) {
    return { passed: true, violations };
  }

  const toolNames = trace.map((call) => call.toolName);

  for (const required of expect.mustCall ?? []) {
    if (!toolNames.includes(required)) {
      violations.push(`expect: missing required tool ${required}`);
    }
  }

  const anyGroup = expect.mustCallAny ?? [];
  if (anyGroup.length > 0 && !anyGroup.some((name) => toolNames.includes(name))) {
    violations.push(
      `expect: missing any of [${anyGroup.join(", ")}]`,
    );
  }

  for (const forbidden of expect.mustNotCall ?? []) {
    if (toolNames.includes(forbidden)) {
      violations.push(`expect: forbidden tool called ${forbidden}`);
    }
  }

  if (
    typeof expect.finishWithinSteps === "number"
    && trace.length > expect.finishWithinSteps
  ) {
    violations.push(
      `expect: ${trace.length} tool calls exceeds limit ${expect.finishWithinSteps}`,
    );
  }

  if (expect.launcher) {
    const launcherRubric = evaluateLauncherExpect(trace, expect.launcher);
    violations.push(...launcherRubric.violations);
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
export function mergeTraceRubrics(
  ...rubrics: Array<AgentEvalTraceRubric | undefined>
): AgentEvalTraceRubric {
  const violations = rubrics.flatMap((r) => r?.violations ?? []);
  return {
    passed: violations.length === 0,
    violations,
  };
}
