import type { AgentUIMessage } from "@/lib/chat-types";
import {
  expandSlashCommand,
  wrapExpandedCommandForModel,
} from "@/lib/agent-defs/command-expand";
import { expandSlashTagsInUserText } from "@/lib/composer-slash-tag";
import { extractLastUserMessageText } from "@/lib/launcher/launcher-command-cache.server";
import { mergeToolRestrictions } from "@/lib/agent-defs/tool-restrictions";

export type ChatCommandOverrides = {
  enabledTools?: string[];
  /** Applied again after static and MCP tools are merged, including internal tools. */
  toolAllowlist?: string[];
  llmSelectionRaw?: string;
};

export type AppliedChatCommand = {
  expandedUserText: string | null;
  overrides: ChatCommandOverrides;
  commandName: string | null;
};

export async function resolveSlashCommandForChat(
  messages: AgentUIMessage[],
  cwd: string,
  enabledTools?: string[],
): Promise<AppliedChatCommand> {
  const lastUserText = expandSlashTagsInUserText(
    extractLastUserMessageText(messages),
  );
  const expanded = await expandSlashCommand(lastUserText, cwd);
  if (!expanded) {
    return { expandedUserText: null, overrides: {}, commandName: null };
  }

  const overrides: ChatCommandOverrides = {
    enabledTools: mergeToolRestrictions(
      enabledTools,
      expanded.allowedTools,
    ),
    toolAllowlist: expanded.allowedTools,
  };
  if (expanded.modelOverride) {
    overrides.llmSelectionRaw = expanded.modelOverride;
  }

  return {
    expandedUserText: wrapExpandedCommandForModel(expanded),
    overrides,
    commandName: expanded.command.name,
  };
}
