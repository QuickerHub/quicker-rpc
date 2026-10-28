import "server-only";

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { executeQuickerToolDirect } from "@/lib/tool-execute.server";
import { allQuickerTools } from "@/lib/tools";
import type { Tool } from "@ai-sdk/provider-utils";
import {
  findDirectLauncherCacheMatch,
  type LauncherCommandCacheEntry,
} from "@/lib/launcher/launcher-command-cache-core";
import {
  loadLauncherCommandCache,
  recordLauncherCommandCacheHits,
} from "@/lib/launcher/launcher-command-cache.server";

async function toolStepNeedsApproval(
  toolName: string,
  input: unknown,
): Promise<boolean> {
  const tool = (allQuickerTools as Record<string, Tool>)[toolName];
  if (!tool?.execute) return true;
  const flag = tool.needsApproval;
  if (flag === undefined) return false;
  if (typeof flag === "boolean") return flag;
  return flag(input, { toolCallId: "precheck", messages: [] });
}

export async function canDirectExecuteLauncherCacheEntry(
  entry: LauncherCommandCacheEntry,
  enabledToolIds: readonly string[],
): Promise<boolean> {
  // Reject the entire chain before approval inspection or executing its prefix.
  const enabled = new Set(enabledToolIds);
  if (entry.steps.some((step) => !enabled.has(step.toolName))) return false;
  for (const step of entry.steps) {
    if (await toolStepNeedsApproval(step.toolName, step.input)) {
      return false;
    }
  }
  return true;
}

export async function tryRespondWithLauncherCacheDirect(params: {
  userText: string;
  repairedMessages: AgentUIMessage[];
  cwd?: string;
  enabledToolIds: readonly string[];
}): Promise<Response | null> {
  if (params.enabledToolIds.length === 0) return null;
  const entry = findDirectLauncherCacheMatch(
    params.userText,
    loadLauncherCommandCache().entries,
  );
  if (!entry) return null;
  if (!(await canDirectExecuteLauncherCacheEntry(entry, params.enabledToolIds))) return null;

  recordLauncherCommandCacheHits([entry.id]);
  return createLauncherCacheDirectStreamResponse({
    entry,
    originalMessages: params.repairedMessages,
    cwd: params.cwd,
  });
}

function createLauncherCacheDirectStreamResponse(params: {
  entry: LauncherCommandCacheEntry;
  originalMessages: AgentUIMessage[];
  cwd?: string;
}): Response {
  const { entry, originalMessages, cwd } = params;

  const stream = createUIMessageStream<AgentUIMessage>({
    originalMessages,
    execute: async ({ writer }) => {
      writer.write({
        type: "start",
        messageMetadata: {
          model: "launcher-cache",
          launcherCacheDirect: true,
        },
      });
      writer.write({ type: "start-step" });

      for (const step of entry.steps) {
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
          model: "launcher-cache",
          launcherCacheDirect: true,
        },
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
