import type { AgentUIMessage } from "./chat-types";
import { canSendComposedMessage } from "./compose-user-message";

/** A confirmation belongs to this mounted editing owner and this exact SDK message revision. */
export type ChatMessageEditBranchContext = {
  owner: object;
  threadId: string;
  visible: boolean;
  anchorMessageId: string | null;
  messages: AgentUIMessage[];
  composerText: string;
};

export function prepareChatMessageEditBranch(context: ChatMessageEditBranchContext) {
  if (!context.visible || !context.anchorMessageId) return;
  const anchorIndex = context.messages.findIndex((message) => message.id === context.anchorMessageId && message.role === "user");
  const text = context.composerText.trim();
  if (anchorIndex < 0 || !canSendComposedMessage(text)) return;
  return {
    owner: context.owner,
    threadId: context.threadId,
    anchorMessageId: context.anchorMessageId,
    messages: context.messages,
    text,
    anchorIndex,
    removedCount: context.messages.length - anchorIndex,
  };
}

export type ChatMessageEditBranch = NonNullable<ReturnType<typeof prepareChatMessageEditBranch>>;

export function canCommitChatMessageEditBranch(branch: ChatMessageEditBranch, context: ChatMessageEditBranchContext): boolean {
  return context.visible && branch.owner === context.owner && branch.threadId === context.threadId
    && branch.anchorMessageId === context.anchorMessageId && branch.messages === context.messages
    && branch.text === context.composerText.trim();
}

/** AI SDK invokes its updater synchronously against the live Chat store, ahead of throttled renders. */
export function replaceChatMessagesIfCurrent(
  setMessages: (update: (current: AgentUIMessage[]) => AgentUIMessage[]) => void,
  expected: AgentUIMessage[], next: AgentUIMessage[],
): boolean {
  let withinCall = true;
  let replaced = false;
  try {
    setMessages((current) => {
      if (!withinCall || current !== expected) return current;
      replaced = true;
      return next;
    });
  } finally { withinCall = false; }
  return replaced;
}
