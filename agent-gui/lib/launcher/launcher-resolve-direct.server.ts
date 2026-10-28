import "server-only";

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { executeQuickerToolDirect } from "@/lib/tool-execute.server";
import { canDirectExecuteLauncherCacheEntry } from "@/lib/launcher/launcher-cache-direct.server";
import type { LauncherCachedToolStep } from "@/lib/launcher/launcher-command-cache-core";
import {
  candidateToNextStep,
  isLauncherResolveDirectEligible,
} from "@/lib/launcher/launcher-resolve-agent-output";
import { resolveLauncherCandidates } from "@/lib/launcher/launcher-resolve-core";

async function canDirectExecuteSteps(
  steps: LauncherCachedToolStep[],
  enabledToolIds: readonly string[],
): Promise<boolean> {
  const enabled = new Set(enabledToolIds);
  if (steps.some((step) => !enabled.has(step.toolName))) return false;
  for (const step of steps) {
    const pseudo = {
      id: "precheck",
      trigger: "",
      steps: [step],
      createdAt: "",
      updatedAt: "",
      useCount: 0,
    };
    if (!(await canDirectExecuteLauncherCacheEntry(pseudo, enabledToolIds))) {
      return false;
    }
  }
  return true;
}

export async function tryRespondWithLauncherResolveDirect(params: {
  userText: string;
  repairedMessages: AgentUIMessage[];
  cwd?: string;
  enabledToolIds: readonly string[];
}): Promise<Response | null> {
  // Discovery may contact or bootstrap the host; it needs its own selection.
  if (!params.enabledToolIds.includes("launcher_resolve")) return null;
  const query = params.userText.trim();
  if (!query) return null;

  const resolved = await resolveLauncherCandidates({ query }, null);
  if (!resolved.ok || !isLauncherResolveDirectEligible(resolved.candidates)) {
    return null;
  }

  const next = candidateToNextStep(resolved.candidates[0]!);
  if (!next) return null;

  const steps: LauncherCachedToolStep[] = [
    { toolName: next.tool, input: next.input },
  ];
  if (!(await canDirectExecuteSteps(steps, params.enabledToolIds))) {
    return null;
  }

  return createLauncherResolveDirectStreamResponse({
    query,
    steps,
    originalMessages: params.repairedMessages,
    cwd: params.cwd,
  });
}

function createLauncherResolveDirectStreamResponse(params: {
  query: string;
  steps: LauncherCachedToolStep[];
  originalMessages: AgentUIMessage[];
  cwd?: string;
}): Response {
  const { query, steps, originalMessages, cwd } = params;

  const stream = createUIMessageStream<AgentUIMessage>({
    originalMessages,
    execute: async ({ writer }) => {
      writer.write({
        type: "start",
        messageMetadata: {
          model: "launcher-resolve",
          launcherResolveDirect: true,
          resolveQuery: query,
        },
      });
      writer.write({ type: "start-step" });

      for (const step of steps) {
        const toolCallId = generateId();
        writer.write({
          type: "tool-input-start",
          toolCallId,
          toolName: step.toolName,
        });
        writer.write({
          type: "tool-input-available",
          toolCallId,
          toolName: step.toolName,
          input: step.input,
        });

        const result = await executeQuickerToolDirect({
          toolName: step.toolName,
          input: step.input,
          workingDirectory: cwd,
          toolCallId,
          approved: true,
        });

        if ("needsApproval" in result) {
          writer.write({
            type: "tool-output-error",
            toolCallId,
            errorText: result.message,
          });
          break;
        }
        if (!result.ok) {
          writer.write({
            type: "tool-output-error",
            toolCallId,
            errorText: result.error,
          });
          break;
        }
        writer.write({
          type: "tool-output-available",
          toolCallId,
          output: result.output,
        });
      }

      writer.write({ type: "finish-step" });
      writer.write({
        type: "finish",
        finishReason: "stop",
        messageMetadata: {
          model: "launcher-resolve",
          launcherResolveDirect: true,
          resolveQuery: query,
        },
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
