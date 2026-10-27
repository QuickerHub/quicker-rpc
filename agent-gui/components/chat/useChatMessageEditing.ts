"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import { isComposerCompositionKey } from "@/lib/composer-keyboard";
import { canCommitChatMessageEditBranch, prepareChatMessageEditBranch } from "@/lib/chat-message-edit-branch";
import {
  canEditUserMessage, clearUserMessageDraftsFromIndex, confirmBranchUserMessageEdit, findMessageIndex,
  hasNonCollapsedTextSelection, pruneUserMessageDrafts, resolveUserMessageDisplayText, upsertUserMessageDraft,
} from "@/lib/user-message-edit";

type EditingState = { anchorMessageId: string | null; liveDraft: string; drafts: Record<string, string> };
type ComposerPort = { getValue: () => string; setValue: (text: string) => void; clear: () => void; beginMessageEdit?: (text: string) => void };

export type UseChatMessageEditingOptions = {
  threadId: string;
  visible: boolean;
  messages: AgentUIMessage[];
  composerRef: { readonly current: ComposerPort | null };
  replaceMessagesIfCurrent: (expected: AgentUIMessage[], next: AgentUIMessage[]) => boolean;
  enqueueOrSend: (text: string) => void;
  clearError: () => void;
  focusComposerAtEnd: () => void;
  pinToStream: () => void;
  /** Defaults to the existing application confirmation; fixtures can defer it without a host. */
  confirmBranch?: (removedCount: number) => Promise<boolean>;
};

const emptyEditingState = (): EditingState => ({ anchorMessageId: null, liveDraft: "", drafts: {} });

/** Mounted per ChatPanel, alongside its single SDK session. The composer still owns actual input. */
export function useChatMessageEditing(options: UseChatMessageEditingOptions) {
  const [editing, setEditing] = useState(emptyEditingState);
  const current = useRef({ options, editing });
  current.current = { options, editing };
  const owner = useRef({ threadId: options.threadId, visible: options.visible, token: {} });
  if (owner.current.threadId !== options.threadId || owner.current.visible !== options.visible) {
    owner.current = { threadId: options.threadId, visible: options.visible, token: {} };
  }
  const pendingConfirmation = useRef<object | null>(null);
  const invalidateConfirmation = useCallback(() => { owner.current.token = {}; pendingConfirmation.current = null; }, []);

  useLayoutEffect(() => {
    // The application keys panels by thread. Also invalidate late work during unmount/StrictMode replay.
    return invalidateConfirmation;
  }, [options.threadId, invalidateConfirmation]);

  const editAnchorIndex = useMemo(() => editing.anchorMessageId
    ? findMessageIndex(options.messages, editing.anchorMessageId) : -1, [options.messages, editing.anchorMessageId]);
  useEffect(() => {
    setEditing((previous) => {
      const drafts = pruneUserMessageDrafts(options.messages, previous.drafts);
      const anchorMessageId = previous.anchorMessageId && findMessageIndex(options.messages, previous.anchorMessageId) < 0
        ? null : previous.anchorMessageId;
      return drafts === previous.drafts && anchorMessageId === previous.anchorMessageId ? previous : { ...previous, drafts, anchorMessageId };
    });
  }, [options.messages]);

  const setEditAnchorLiveDraft = useCallback((liveDraft: string) => {
    invalidateConfirmation();
    setEditing((previous) => previous.anchorMessageId && previous.liveDraft !== liveDraft ? { ...previous, liveDraft } : previous);
  }, [invalidateConfirmation]);

  const exitMessageEdit = useCallback(() => {
    const { options: live, editing: previous } = current.current;
    if (!live.visible || !previous.anchorMessageId) return;
    invalidateConfirmation();
    const message = live.messages.find((entry) => entry.id === previous.anchorMessageId);
    const draft = live.composerRef.current?.getValue() ?? "";
    setEditing((value) => ({ anchorMessageId: null, liveDraft: "",
      drafts: message ? upsertUserMessageDraft(message, draft, value.drafts) : value.drafts }));
    live.composerRef.current?.clear();
  }, [invalidateConfirmation]);

  const discardMessageEditSession = useCallback(() => {
    if (!current.current.options.visible) return;
    invalidateConfirmation();
    setEditing((previous) => ({ ...previous, anchorMessageId: null, liveDraft: "" }));
    current.current.options.composerRef.current?.clear();
  }, [invalidateConfirmation]);

  const beginEditFromUserMessage = useCallback((message: AgentUIMessage) => {
    const { options: live, editing: previous } = current.current;
    if (!live.visible || !canEditUserMessage(message, previous.drafts) || hasNonCollapsedTextSelection()) return;
    invalidateConfirmation();
    const anchor = previous.anchorMessageId && previous.anchorMessageId !== message.id
      ? live.messages.find((entry) => entry.id === previous.anchorMessageId) : undefined;
    const drafts = anchor ? upsertUserMessageDraft(anchor, live.composerRef.current?.getValue() ?? "", previous.drafts) : previous.drafts;
    const liveDraft = resolveUserMessageDisplayText(message, drafts);
    setEditing({ anchorMessageId: message.id, liveDraft, drafts });
    const composer = live.composerRef.current;
    if (composer?.beginMessageEdit) {
      live.clearError();
      composer.beginMessageEdit(liveDraft);
    } else {
      composer?.setValue(liveDraft);
      live.clearError();
      live.focusComposerAtEnd();
    }
  }, [invalidateConfirmation]);

  const readBranchContext = useCallback(() => {
    const { options: live, editing: previous } = current.current;
    return { owner: owner.current.token, threadId: live.threadId, visible: live.visible,
      anchorMessageId: previous.anchorMessageId, messages: live.messages, composerText: live.composerRef.current?.getValue() ?? "" };
  }, []);
  const commitBranchMessageEdit = useCallback(async (): Promise<boolean> => {
    if (pendingConfirmation.current) return false;
    const branch = prepareChatMessageEditBranch(readBranchContext());
    if (!branch) return false;
    const confirmation = {};
    pendingConfirmation.current = confirmation;
    try {
      const confirmed = await (current.current.options.confirmBranch ?? confirmBranchUserMessageEdit)(branch.removedCount);
      if (!confirmed || pendingConfirmation.current !== confirmation || !canCommitChatMessageEditBranch(branch, readBranchContext())) return false;
      const live = current.current.options;
      if (!live.replaceMessagesIfCurrent(branch.messages, branch.messages.slice(0, branch.anchorIndex))) return false;
      setEditing((previous) => ({ anchorMessageId: null, liveDraft: "",
        drafts: clearUserMessageDraftsFromIndex(branch.messages, branch.anchorIndex, previous.drafts) }));
      live.composerRef.current?.clear();
      live.pinToStream();
      live.enqueueOrSend(branch.text);
      return true;
    } finally {
      if (pendingConfirmation.current === confirmation) pendingConfirmation.current = null;
    }
  }, [readBranchContext]);

  useEffect(() => {
    if (!options.visible || !editing.anchorMessageId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!current.current.options.visible || !current.current.editing.anchorMessageId
        || event.key !== "Escape" || isComposerCompositionKey(event)) return;
      // The existing confirmation owns its keyboard interaction; cancel keeps the editing draft.
      if (pendingConfirmation.current && document.querySelector(".app-confirm-backdrop")) return;
      event.preventDefault();
      discardMessageEditSession();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.target.closest(".composer-box, .composer-edit-banner, .msg--edit-anchor .msg-content")) return;
      if (pendingConfirmation.current && event.target.closest(".app-confirm-backdrop")) return;
      exitMessageEdit();
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [options.visible, editing.anchorMessageId, discardMessageEditSession, exitMessageEdit]);

  return { editAnchorMessageId: editing.anchorMessageId, editAnchorLiveDraft: editing.liveDraft,
    userMessageDrafts: editing.drafts, editAnchorIndex, setEditAnchorLiveDraft,
    beginEditFromUserMessage, exitMessageEdit, commitBranchMessageEdit };
}
