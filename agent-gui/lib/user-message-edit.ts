import { isTextUIPart } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { canSendComposedMessage } from "@/lib/compose-user-message";
import { nativeConfirm } from "@/lib/native-confirm";

/** Stored user message text (tag markup + body) for composer round-trip. */
export function getUserMessageDisplayText(message: AgentUIMessage): string {
  if (message.role !== "user") return "";
  const chunks: string[] = [];
  for (const part of message.parts) {
    if (isTextUIPart(part) && part.text) {
      chunks.push(part.text);
    }
  }
  return chunks.join("");
}

/** Ignore click-to-edit when the user is copying message text. */
export function hasNonCollapsedTextSelection(): boolean {
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && (sel.toString()?.trim().length ?? 0) > 0;
}

export function findMessageIndex(
  messages: AgentUIMessage[],
  messageId: string,
): number {
  return messages.findIndex((m) => m.id === messageId);
}

/** How many messages (including the anchor) are removed when branching. */
export function countMessagesRemovedOnBranch(
  messages: AgentUIMessage[],
  anchorIndex: number,
): number {
  if (anchorIndex < 0) return 0;
  return Math.max(0, messages.length - anchorIndex);
}

export function resolveUserMessageDisplayText(
  message: AgentUIMessage,
  localDrafts: Readonly<Record<string, string>>,
): string {
  const draft = localDrafts[message.id];
  if (draft !== undefined) return draft;
  return getUserMessageDisplayText(message);
}

export function userMessageHasLocalDraft(
  message: AgentUIMessage,
  localDrafts: Readonly<Record<string, string>>,
): boolean {
  const draft = localDrafts[message.id];
  if (draft === undefined) return false;
  return draft !== getUserMessageDisplayText(message);
}

export function canEditUserMessage(
  message: AgentUIMessage,
  localDrafts: Readonly<Record<string, string>> = {},
): boolean {
  if (message.role !== "user") return false;
  if (localDrafts[message.id] !== undefined) return true;
  return canSendComposedMessage(getUserMessageDisplayText(message));
}

export function pruneUserMessageDrafts(
  messages: AgentUIMessage[],
  localDrafts: Readonly<Record<string, string>>,
): Record<string, string> {
  const ids = new Set(messages.map((m) => m.id));
  let changed = false;
  const next: Record<string, string> = {};
  for (const [id, text] of Object.entries(localDrafts)) {
    if (!ids.has(id)) {
      changed = true;
      continue;
    }
    next[id] = text;
  }
  return changed ? next : localDrafts;
}

export function clearUserMessageDraftsFromIndex(
  messages: AgentUIMessage[],
  fromIndex: number,
  localDrafts: Readonly<Record<string, string>>,
): Record<string, string> {
  if (fromIndex < 0) return { ...localDrafts };
  const next = { ...localDrafts };
  let changed = false;
  for (let i = fromIndex; i < messages.length; i += 1) {
    const id = messages[i]?.id;
    if (id && id in next) {
      delete next[id];
      changed = true;
    }
  }
  return changed ? next : localDrafts;
}

export function upsertUserMessageDraft(
  message: AgentUIMessage,
  draftText: string,
  localDrafts: Readonly<Record<string, string>>,
): Record<string, string> {
  const original = getUserMessageDisplayText(message);
  if (draftText === original) {
    if (!(message.id in localDrafts)) return { ...localDrafts };
    const next = { ...localDrafts };
    delete next[message.id];
    return next;
  }
  return { ...localDrafts, [message.id]: draftText };
}

export async function confirmBranchUserMessageEdit(
  removedCount: number,
): Promise<boolean> {
  if (removedCount <= 0) return true;
  const suffix =
    removedCount === 1
      ? "并删除之后的 1 条消息"
      : `并删除之后的 ${removedCount} 条消息`;
  return nativeConfirm(`将从此消息处重新对话，${suffix}。确定继续？`, {
    defaultConfirm: true,
  });
}
