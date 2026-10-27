"use client";

import { createContext, useContext, type ReactNode } from "react";

const ConversationPresentationContext = createContext(true);

/** Presentation only: hiding a conversation does not stop its session or tools. */
export function ConversationPresentationProvider({ active, children }: {
  active: boolean;
  children: ReactNode;
}) {
  const parentActive = useContext(ConversationPresentationContext);
  return <ConversationPresentationContext.Provider value={parentActive && active}>
    {children}
  </ConversationPresentationContext.Provider>;
}

export function useConversationPresentationActive(): boolean {
  return useContext(ConversationPresentationContext);
}
