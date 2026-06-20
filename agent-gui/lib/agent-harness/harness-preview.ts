import type { ModelMessage } from "ai";
import { attachShellOutputArtifact } from "@/lib/agent-harness/artifacts/shell-artifact";
import { applySlidingWindowTrim } from "@/lib/agent-harness/sliding-window-trim";
import { SHELL_TOOL } from "@/lib/host-tool-constants";
import { formatLocalToolResult } from "@/lib/tool-result";
import { formatToolResultForAgent } from "@/lib/tool-result-agent-view";
import { buildModelFacingToolOutput } from "@/lib/tool-result-model-messages";
import {
  CORE_TOOL_ROUTING_TABLE,
  TOOL_ROUTING_PROMPT,
  TOOL_ROUTING_TABLE,
} from "@/lib/tool-routing";
import {
  buildShellArtifactScenarioOutput,
  buildSlidingWindowScenarioMessages,
  getHarnessScenario,
  type HarnessScenario,
} from "@/lib/tool-test-harness-scenarios";

function estimateMessagesChars(messages: ModelMessage[]): number {
  try {
    return JSON.stringify(messages).length;
  } catch {
    return 0;
  }
}

function readToolOutputPreviewFlag(message: ModelMessage | undefined): boolean {
  if (message?.role !== "tool") return false;
  const part = message.content[0];
  if (!part || part.type !== "tool-result") return false;
  const output = part.output;
  if (
    output != null
    && typeof output === "object"
    && "type" in output
    && (output as { type: string }).type === "json"
  ) {
    const value = (output as { value?: Record<string, unknown> }).value;
    return value?.preview === true;
  }
  return false;
}

export type SlidingWindowHarnessPreview = {
  kind: "sliding-window";
  beforeChars: number;
  afterChars: number;
  savedChars: number;
  applied: boolean;
  tokensSavedEstimate: number;
  oldTurnPreviewed: boolean;
  recentTurnFull: boolean;
  modelMessageCount: number;
};

export type ShellArtifactHarnessPreview = {
  kind: "shell-artifact";
  thresholdChars: number;
  totalOutputChars: number;
  artifactPath?: string;
  bytesWritten?: number;
  modelPayloadChars: number;
  displayDataChars: number;
  readHint?: string;
  modelPayloadJson?: string;
};

export type ListToolsRoutingHarnessPreview = {
  kind: "list-tools-routing";
  compactPromptChars: number;
  coreRoutingChars: number;
  fullRoutingTableChars: number;
  savedVsFull: number;
  savingsPercent: number;
};

export type HarnessPreviewResult =
  | SlidingWindowHarnessPreview
  | ShellArtifactHarnessPreview
  | ListToolsRoutingHarnessPreview;

export function previewSlidingWindowHarness(): SlidingWindowHarnessPreview {
  const messages = buildSlidingWindowScenarioMessages();
  const beforeChars = estimateMessagesChars(messages);
  const trimmed = applySlidingWindowTrim(messages);
  const afterChars = estimateMessagesChars(trimmed.messages);

  return {
    kind: "sliding-window",
    beforeChars,
    afterChars,
    savedChars: Math.max(0, beforeChars - afterChars),
    applied: trimmed.applied,
    tokensSavedEstimate: trimmed.tokensSavedEstimate,
    oldTurnPreviewed: readToolOutputPreviewFlag(trimmed.messages[1]),
    recentTurnFull: !readToolOutputPreviewFlag(trimmed.messages[7]),
    modelMessageCount: trimmed.messages.length,
  };
}

export async function previewShellArtifactHarness(
  options?: { toolCallId?: string },
): Promise<ShellArtifactHarnessPreview> {
  const output = buildShellArtifactScenarioOutput();
  const artifact = await attachShellOutputArtifact(output, {
    toolCallId: options?.toolCallId ?? "harness-shell-preview",
  });

  const fullData = {
    commandLine: "dotnet build",
    output,
  };

  let modelData: Record<string, unknown> = fullData;
  if (artifact) {
    modelData = {
      ...fullData,
      output: artifact.tailPreview,
      artifactRef: artifact.artifactRef,
      bytesWritten: artifact.artifactRef.bytesWritten,
      totalOutputChars: artifact.totalOutputChars,
      readHint: artifact.readHint,
      truncated: true,
    };
  }

  const structured = formatLocalToolResult(modelData, true);
  const withDisplay = artifact
    ? { ...structured, displayData: fullData }
    : structured;
  const modelPayload = formatToolResultForAgent(
    SHELL_TOOL,
    { description: "harness", command: "dotnet build" },
    withDisplay,
  );
  const modelFacing = buildModelFacingToolOutput(modelPayload);

  return {
    kind: "shell-artifact",
    thresholdChars: output.length,
    totalOutputChars: output.length,
    artifactPath: artifact?.artifactRef.path,
    bytesWritten: artifact?.artifactRef.bytesWritten,
    modelPayloadChars: JSON.stringify(modelFacing).length,
    displayDataChars: JSON.stringify(fullData).length,
    readHint: artifact?.readHint,
    modelPayloadJson: JSON.stringify(modelFacing, null, 2),
  };
}

export function previewListToolsRoutingHarness(): ListToolsRoutingHarnessPreview {
  const compactPromptChars = TOOL_ROUTING_PROMPT.length;
  const coreRoutingChars = CORE_TOOL_ROUTING_TABLE.length;
  const fullRoutingTableChars = TOOL_ROUTING_TABLE.length;
  const savedVsFull = Math.max(0, fullRoutingTableChars - compactPromptChars);
  const savingsPercent =
    fullRoutingTableChars > 0
      ? Math.round((savedVsFull / fullRoutingTableChars) * 100)
      : 0;

  return {
    kind: "list-tools-routing",
    compactPromptChars,
    coreRoutingChars,
    fullRoutingTableChars,
    savedVsFull,
    savingsPercent,
  };
}

export async function runHarnessScenarioPreview(
  scenario: HarnessScenario,
  options?: { toolCallId?: string },
): Promise<HarnessPreviewResult> {
  if (scenario.kind === "sliding-window") {
    return previewSlidingWindowHarness();
  }
  if (scenario.kind === "list-tools-routing") {
    return previewListToolsRoutingHarness();
  }
  return previewShellArtifactHarness(options);
}

export async function runHarnessScenarioPreviewById(
  scenarioId: string,
  options?: { toolCallId?: string },
): Promise<HarnessPreviewResult | null> {
  const scenario = getHarnessScenario(scenarioId);
  if (!scenario) return null;
  return runHarnessScenarioPreview(scenario, options);
}
