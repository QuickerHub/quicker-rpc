import { isTextUIPart } from "ai";

import type { AgentUIMessage } from "@/lib/chat-types";
import { expandUserMessageForModel } from "@/lib/compose-user-message";
import { parseSlashCommandInput } from "@/lib/agent-defs/command-expand";
import { expandSlashTagsInUserText } from "@/lib/composer-slash-tag";

/**
 * Convert persisted UI messages into model-facing messages for one turn.
 *
 * Only the latest user message may receive this turn's slash expansion.
 * Historical command text stays intact; normal Quicker tag projection still
 * applies to model-facing copies of user messages.
 */
export function prepareTurnMessagesForModel(params: {
  messages: AgentUIMessage[];
  expandedSlashUserText?: string | null;
  liveProgramDocument?: boolean;
}): AgentUIMessage[] {
  let slashTextApplied = false;
  const latestUserIndex = params.messages.findLastIndex((message) => message.role === "user");

  return params.messages.map((message, messageIndex) => {
    if (message.role !== "user") return message;

    return {
      ...message,
      parts: message.parts.map((part) => {
        if (!isTextUIPart(part)) return part;

        let text = expandUserMessageForModel(part.text, params.liveProgramDocument === true && messageIndex === latestUserIndex);
        if (
          !slashTextApplied
          && messageIndex === latestUserIndex
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
