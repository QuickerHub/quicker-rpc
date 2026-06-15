import type { MutableRefObject } from "react";
import type { BrowserElementTag } from "@/lib/browser-element-tag";
import type { ProgramStepTag } from "@/lib/program-step-tag";

export type ChatComposerActions = {
  insertPrompt: (text: string) => void;
  insertBrowserElementTag: (element: BrowserElementTag) => void;
  insertProgramStepTag: (tag: ProgramStepTag) => void;
  focusComposer: () => void;
};

export const emptyChatComposerActions: ChatComposerActions = {
  insertPrompt: () => {},
  insertBrowserElementTag: () => {},
  insertProgramStepTag: () => {},
  focusComposer: () => {},
};

/** Registered by the visible ChatPanel; side-panel tools use this to prefill composer. */
export const chatComposerActionsRef: MutableRefObject<ChatComposerActions> = {
  current: emptyChatComposerActions,
};

let registeredComposerOwnerId: string | null = null;

export function registerChatComposerActions(
  ownerId: string,
  actions: ChatComposerActions,
): void {
  registeredComposerOwnerId = ownerId;
  chatComposerActionsRef.current = actions;
}

export function unregisterChatComposerActions(ownerId: string): void {
  if (registeredComposerOwnerId !== ownerId) return;
  registeredComposerOwnerId = null;
  chatComposerActionsRef.current = emptyChatComposerActions;
}
