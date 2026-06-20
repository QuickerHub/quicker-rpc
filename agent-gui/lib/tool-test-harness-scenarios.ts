import type { ModelMessage } from "ai";
import { SHELL_ARTIFACT_THRESHOLD_CHARS } from "@/lib/agent-harness/artifacts/types";

export type HarnessScenarioKind =
  | "sliding-window"
  | "shell-artifact"
  | "list-tools-routing"
  | "static-shell";

export type HarnessScenario = {
  id: string;
  label: string;
  description: string;
  kind: HarnessScenarioKind;
};

export const HARNESS_SCENARIOS: HarnessScenario[] = [
  {
    id: "sliding-window-old-tool",
    label: "滑动窗口 · 旧 turn",
    description: "近 2 个 user turn 保留全量 tool 输出，更早 turn 大输出变 preview",
    kind: "sliding-window",
  },
  {
    id: "shell-artifact-large",
    label: "Shell artifact",
    description: `stdout ≥${(SHELL_ARTIFACT_THRESHOLD_CHARS / 1024).toFixed(0)}KB 落盘 .local/agent-artifacts，模型只见 tail + artifactRef`,
    kind: "shell-artifact",
  },
  {
    id: "list-tools-routing",
    label: "list_tools routing",
    description: "system 内联 core routing vs list_tools action=routing 全表体积",
    kind: "list-tools-routing",
  },
  {
    id: "static-shell-baseline",
    label: "Static shell 基线",
    description: "空 turn system + tool schema 分段 token（目标 system ≤8K）",
    kind: "static-shell",
  },
];

export function getHarnessScenario(id: string): HarnessScenario | undefined {
  return HARNESS_SCENARIOS.find((item) => item.id === id);
}

function toolResultMessage(
  toolCallId: string,
  toolName: string,
  output: unknown,
): ModelMessage {
  return {
    role: "tool",
    content: [{
      type: "tool-result",
      toolCallId,
      toolName,
      output: { type: "json", value: output },
    }],
  };
}

/** Synthetic multi-turn thread for sliding-window preview. */
export function buildSlidingWindowScenarioMessages(): ModelMessage[] {
  const large = { ok: true, stdout: "line\n".repeat(1200) };
  return [
    { role: "user", content: "turn 1 — grep logs" },
    toolResultMessage("c1", "Grep", large),
    { role: "assistant", content: "Found matches in turn 1." },
    { role: "user", content: "turn 2 — shell build" },
    toolResultMessage("c2", "Shell", large),
    { role: "assistant", content: "Build finished in turn 2." },
    { role: "user", content: "turn 3 — recent shell" },
    toolResultMessage("c3", "Shell", large),
  ];
}

export function buildShellArtifactScenarioOutput(): string {
  return `build log\n${"x".repeat(SHELL_ARTIFACT_THRESHOLD_CHARS + 512)}\n`;
}
