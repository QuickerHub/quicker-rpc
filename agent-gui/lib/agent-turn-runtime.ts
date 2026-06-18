import "server-only";

import type { AgentUIMessage } from "@/lib/chat-types";
import { CHAT_MODE_LAUNCHER, type ChatMode } from "@/lib/chat-mode";
import {
  formatActionScopeForSystem,
  type ActionScopeHint,
} from "@/lib/action-scope";
import {
  buildAgentRuntimeSnapshot,
  type AgentRuntimeSnapshot,
} from "@/lib/agent-runtime-snapshot";
import { buildSystemInstructions } from "@/lib/instructions";
import {
  buildLauncherCommandCachePromptBlock,
} from "@/lib/launcher/launcher-command-cache.server";
import {
  SET_THREAD_TITLE_TOOL,
  buildThreadTitleAgentInstruction,
  buildTitleTestChatInstruction,
} from "@/lib/set-thread-title-tool";
import { composeChatSystemPrompt } from "@/lib/agent-system-prompt";
import { pickChatTools } from "@/lib/tool-registry";
import { quickerTools } from "@/lib/tools";

export type PreparedChatContext = {
  systemSuffix?: string;
};

export function selectChatTools(params: {
  chatMode: ChatMode;
  enabledToolIds: string[];
  titleTest: boolean;
}) {
  if (params.titleTest) {
    return { [SET_THREAD_TITLE_TOOL]: quickerTools[SET_THREAD_TITLE_TOOL] };
  }

  return pickChatTools(quickerTools, params.enabledToolIds, [
    ...(params.chatMode === CHAT_MODE_LAUNCHER ? [] : [SET_THREAD_TITLE_TOOL]),
  ]);
}

export async function createChatSystemBuilder(params: {
  actionScope: ActionScopeHint;
  chatMode: ChatMode;
  cwd: string;
  designerEmbedBlock?: string;
  enabledToolIds: string[];
  launcherUserText: string;
  modelId: string;
  repairedMessages: AgentUIMessage[];
  runtimeSnapshot?: AgentRuntimeSnapshot;
  titleManual: boolean;
  titleTest: boolean;
}) {
  const scopeBlock = formatActionScopeForSystem(params.actionScope);
  const baseSystem = await buildSystemInstructions(params.cwd, params.chatMode);
  const launcherCacheBlock =
    params.chatMode === CHAT_MODE_LAUNCHER
      ? await buildLauncherCommandCachePromptBlock(params.launcherUserText)
      : undefined;
  const titleInstruction = params.titleTest
    ? buildTitleTestChatInstruction()
    : params.chatMode === CHAT_MODE_LAUNCHER
      ? null
      : buildThreadTitleAgentInstruction({
          messages: params.repairedMessages,
          titleManual: params.titleManual,
        });

  return (context: PreparedChatContext) =>
    composeChatSystemPrompt({
      baseSystem,
      contextSystemSuffix: context.systemSuffix,
      designerEmbedBlock: params.designerEmbedBlock,
      launcherCacheBlock,
      scopeBlock,
      titleInstruction,
      titleTest: params.titleTest,
    });
}
