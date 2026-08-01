import { isTextUIPart } from "ai";

import type { AgentUIMessage } from "@/lib/chat-types";
import { expandUserMessageForModel } from "@/lib/compose-user-message";
import { parseSlashCommandInput } from "@/lib/agent-defs/command-expand";
import { expandSlashTagsInUserText } from "@/lib/composer-slash-tag";

/**
 * Convert persisted UI messages into model-facing messages for one turn.
 *
 * Slash commands are expanded once: the first user text part that actually
 * contains a slash command is replaced, while every other user part still
 * receives the normal Quicker tag expansion.
 */
export function prepareTurnMessagesForModel(params: {
  messages: AgentUIMessage[];
  expandedSlashUserText?: string | null;
}): AgentUIMessage[] {
  let slashTextApplied = false;

  return params.messages.map((message) => {
    if (message.role !== "user") return message;

    return {
      ...message,
      parts: message.parts.map((part) => {
        if (!isTextUIPart(part)) return part;

        let text = expandUserMessageForModel(part.text);
        if (
          !slashTextApplied
          && params.expandedSlashUserText
          && parseSlashCommandInput(expandSlashTagsInUserText(part.text).trim())
        ) {
          slashTextApplied = true;
          text = params.expandedSlashUserText;
        }
        return { ...part, text };
      }),
    };
  });
}
