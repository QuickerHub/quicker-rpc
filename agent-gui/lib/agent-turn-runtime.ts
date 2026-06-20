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
import { formatIntentMatchedSkillsForPrompt } from "@/lib/agent-skills/skill-intent-preload";
import {
  buildLauncherCommandCachePromptBlock,
} from "@/lib/launcher/launcher-command-cache.server";
import {
  buildThreadTitleAgentInstruction,
  buildTitleTestChatInstruction,
} from "@/lib/set-thread-title-tool";
import { buildBenchModeChatInstruction } from "@/lib/bench-mode";
import { composeChatSystemPrompt } from "@/lib/agent-system-prompt";
import {
  DEV_AGENT_UI_SYSTEM_BLOCK,
  isDevAgentEnvironment,
} from "@/lib/dev-agent-tools";
import { selectChatTools } from "@/lib/select-chat-tools.server";

export type PreparedChatContext = {
  systemSuffix?: string;
};

export { selectChatTools } from "@/lib/select-chat-tools.server";

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
  slashCommandName?: string | null;
  titleManual: boolean;
  titleTest: boolean;
  benchMode?: boolean;
}) {
  const scopeBlock = formatActionScopeForSystem(params.actionScope);
  const [baseSystem, intentSkillBlock] = await Promise.all([
    buildSystemInstructions(params.cwd, params.chatMode),
    formatIntentMatchedSkillsForPrompt({
      userText: params.launcherUserText,
      chatMode: params.chatMode,
      cwd: params.cwd,
      slashCommandName: params.slashCommandName,
      actionScope: params.actionScope,
    }),
  ]);
  const mergedBase = intentSkillBlock
    ? `${baseSystem}\n\n${intentSkillBlock}`
    : baseSystem;
  const devUiBlock =
    isDevAgentEnvironment() && params.chatMode !== CHAT_MODE_LAUNCHER
      ? DEV_AGENT_UI_SYSTEM_BLOCK
      : undefined;
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
      baseSystem: devUiBlock ? `${mergedBase}\n\n${devUiBlock}` : mergedBase,
      contextSystemSuffix: context.systemSuffix,
      designerEmbedBlock: params.designerEmbedBlock,
      launcherCacheBlock,
      scopeBlock,
      titleInstruction,
      titleTest: params.titleTest,
      benchMode: params.benchMode === true,
      benchInstruction: params.benchMode ? buildBenchModeChatInstruction() : undefined,
    });
}
