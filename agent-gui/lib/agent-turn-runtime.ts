import "server-only";

import type { AgentUIMessage } from "@/lib/chat-types";
import { CHAT_MODE_LAUNCHER, type ChatMode } from "@/lib/chat-mode";
import {
  formatActionScopeForSystem,
  type ActionScopeHint,
} from "@/lib/action-scope";
import { formatChatRuntimeContext } from "@/lib/agent-runtime-context";
import {
  formatAgentTurnStateForPrompt,
} from "@/lib/agent-turn-state";
import { formatRecoveryDecisionForPrompt } from "@/lib/agent-recovery-policy";
import {
  buildAgentRuntimeSnapshot,
  type AgentRuntimeSnapshot,
} from "@/lib/agent-runtime-snapshot";
import { buildSystemInstructions } from "@/lib/instructions";
import {
  collectRecentToolFeedback,
  formatRecentToolFeedbackForPrompt,
} from "@/lib/tool-feedback-context";
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
  const runtimeContextBlock = formatChatRuntimeContext({
    mode: params.chatMode,
    cwd: params.cwd,
    modelId: params.modelId,
    enabledToolIds: params.enabledToolIds,
  });
  const runtimeSnapshot =
    params.runtimeSnapshot
    ?? buildAgentRuntimeSnapshot({
      actionScope: params.actionScope,
      chatMode: params.chatMode,
      enabledToolIds: params.enabledToolIds,
      messages: params.repairedMessages,
      userText: params.launcherUserText,
    });
  const turnStateBlock = formatAgentTurnStateForPrompt(runtimeSnapshot.turnState);
  const recentToolFeedback = collectRecentToolFeedback(params.repairedMessages);
  const toolFeedbackBlock = formatRecentToolFeedbackForPrompt(recentToolFeedback);
  const recoveryDecisionBlock = formatRecoveryDecisionForPrompt(
    runtimeSnapshot.recoveryDecision,
  );
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
      launcherCacheBlock,
      recoveryDecisionBlock,
      runtimeContextBlock,
      scopeBlock,
      titleInstruction,
      titleTest: params.titleTest,
      toolFeedbackBlock,
      turnStateBlock,
    });
}
