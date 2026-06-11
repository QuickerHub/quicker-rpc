import type { AgentUIMessage } from "@/lib/chat-types";
import {
  expandSlashCommand,
  wrapExpandedCommandForModel,
} from "@/lib/agent-defs/command-expand";
import { extractLastUserMessageText } from "@/lib/launcher/launcher-command-cache.server";

export type ChatCommandOverrides = {
  enabledTools?: string[];
  llmSelectionRaw?: string;
};

export type AppliedChatCommand = {
  expandedUserText: string | null;
  overrides: ChatCommandOverrides;
  commandName: string | null;
};

function mergeToolRestrictions(
  baseEnabled: string[] | undefined,
  allowedTools: string[],
): string[] | undefined {
  if (!allowedTools.length) return baseEnabled;
  if (!baseEnabled?.length) return allowedTools;
  const allowed = new Set(allowedTools);
  return baseEnabled.filter((id) => allowed.has(id));
}

export async function resolveSlashCommandForChat(
  messages: AgentUIMessage[],
  cwd: string,
  enabledTools?: string[],
): Promise<AppliedChatCommand> {
  const lastUserText = extractLastUserMessageText(messages);
  const expanded = await expandSlashCommand(lastUserText, cwd);
  if (!expanded) {
    return { expandedUserText: null, overrides: {}, commandName: null };
  }

  const overrides: ChatCommandOverrides = {
    enabledTools: mergeToolRestrictions(
      enabledTools,
      expanded.allowedTools,
    ),
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
