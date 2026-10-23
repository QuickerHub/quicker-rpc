import "server-only";

import type { AgentUIMessage } from "@/lib/chat-types";
import {
  CHAT_MODE_LAUNCHER,
  resolveChatMode,
  resolveEnabledToolsForChatMode,
  type ChatMode,
} from "@/lib/chat-mode";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";
import {
  resolveSlashCommandForChat,
  type AppliedChatCommand,
} from "@/lib/agent-defs/apply-chat-command.server";
import { resolveLlmSelection } from "@/lib/llm";
import type { LlmSelection } from "@/lib/llm-selection";
import { extractLastUserMessageText } from "@/lib/launcher/launcher-command-cache.server";
import { repairInterruptedToolCalls } from "@/lib/repair-interrupted-tool-calls";
import { defaultEnabledToolIds } from "@/lib/tool-registry";
import type { ChatPostBody } from "@/lib/agent-harness/types";
import { prepareTurnMessagesForModel } from "@/lib/agent-harness/turn-message-preparation";
import { resolveEffectiveTurnSelection } from "@/lib/agent-harness/turn-selection";
import {
  resolveActionDesignerForChatTurn,
  type ActionDesignerChatContext,
} from "@/lib/designer-embed-prompt";

/** Normalized, immutable input shared by all phases of one agent turn. */
export type ResolvedAgentTurnRequest = {
  body: ChatPostBody;
  chatMode: ChatMode;
  cwd: string;
  repairedMessages: AgentUIMessage[];
  messagesForModel: AgentUIMessage[];
  titleTest: boolean;
  benchMode: boolean;
  enabledToolIds: string[];
  slashCommand: AppliedChatCommand;
  selection: LlmSelection;
  lastUserText: string;
  llmSelectionRaw?: string;
  threadId?: string;
  actionDesigner?: ActionDesignerChatContext;
};

/** Resolve transport/UI details before model or tool execution begins. */
export async function resolveAgentTurnRequest(
  body: ChatPostBody,
): Promise<ResolvedAgentTurnRequest> {
  const chatMode = resolveChatMode(body.chatMode);
  const cwd = resolveEffectiveWorkingDirectory(
    body.workingDirectory ?? body.workspaceRoot,
  );
  const repairedMessages = repairInterruptedToolCalls(body.messages);
  const titleTest = body.titleTestOnly === true;
  const benchMode = body.benchMode === true && !titleTest;
  const modeEnabledTools = resolveEnabledToolsForChatMode(
    chatMode,
    body.enabledTools,
    defaultEnabledToolIds,
  );
  const slashCommand =
    chatMode !== CHAT_MODE_LAUNCHER && !titleTest
      ? await resolveSlashCommandForChat(repairedMessages, cwd, modeEnabledTools)
      : { expandedUserText: null, overrides: {}, commandName: null };
  const enabledToolIds = slashCommand.overrides.enabledTools ?? modeEnabledTools;
  const { selection, llmSelectionRaw } = resolveEffectiveTurnSelection({
    commandModelOverride: slashCommand.overrides.llmSelectionRaw,
    llmSelection: body.llmSelection,
    llmProvider: body.llmProvider,
  }, resolveLlmSelection);

  return {
    body,
    chatMode,
    cwd,
    repairedMessages,
    messagesForModel: prepareTurnMessagesForModel({
      messages: repairedMessages,
      expandedSlashUserText: slashCommand.expandedUserText,
    }),
    titleTest,
    benchMode,
    enabledToolIds,
    slashCommand,
    selection,
    lastUserText: extractLastUserMessageText(repairedMessages),
    llmSelectionRaw,
    threadId: body.threadId,
    actionDesigner: resolveActionDesignerForChatTurn(body),
  };
}
