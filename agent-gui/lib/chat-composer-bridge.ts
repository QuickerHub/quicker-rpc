import type { MutableRefObject } from "react";
import type { BrowserElementTag } from "@/lib/browser-element-tag";

export type ChatComposerActions = {
  insertPrompt: (text: string) => void;
  insertBrowserElementTag: (element: BrowserElementTag) => void;
  focusComposer: () => void;
};

const stub: ChatComposerActions = {
  insertPrompt: () => {},
  insertBrowserElementTag: () => {},
  focusComposer: () => {},
};

/** Registered by ChatPanel; side-panel browser uses this to prefill composer. */
export const chatComposerActionsRef: MutableRefObject<ChatComposerActions> = {
  current: stub,
};
