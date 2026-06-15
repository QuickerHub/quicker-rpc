import {
  getToolOrDynamicToolName,
  isTextUIPart,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";

/** Fingerprint live chat messages so tool state/output changes still trigger run patches. */
export function buildToolTestChatMessagesPatchKey(
  messages: UIMessage[],
): string {
  const tokens: string[] = [String(messages.length)];

  for (const message of messages) {
    tokens.push(message.id, String(message.parts.length));
    for (const part of message.parts) {
      if (isTextUIPart(part)) {
        tokens.push(`text:${part.text.length}`);
        continue;
      }
      if (isToolOrDynamicToolUIPart(part)) {
        const state = "state" in part ? String(part.state) : "";
        const toolCallId =
          "toolCallId" in part && typeof part.toolCallId === "string"
            ? part.toolCallId
            : "";
        const hasOutput = "output" in part && part.output !== undefined;
        tokens.push(
          `tool:${getToolOrDynamicToolName(part)}:${toolCallId}:${state}:${hasOutput ? 1 : 0}`,
        );
      }
    }
  }

  return tokens.join("|");
}
