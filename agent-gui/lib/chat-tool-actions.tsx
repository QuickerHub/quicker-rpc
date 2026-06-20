"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { AgentUIMessage } from "@/lib/chat-types";

export type ChatAddToolOutput = UseChatHelpers<AgentUIMessage>["addToolOutput"];

const ChatToolActionsContext = createContext<ChatAddToolOutput | null>(null);

export function ChatToolActionsProvider({
  addToolOutput,
  children,
}: {
  addToolOutput: ChatAddToolOutput;
  children: ReactNode;
}) {
  const addToolOutputRef = useRef(addToolOutput);
  addToolOutputRef.current = addToolOutput;
  const stableAddToolOutput = useCallback(
    ((...args: Parameters<ChatAddToolOutput>) =>
      addToolOutputRef.current(...args)) as ChatAddToolOutput,
    [],
  );

  return (
    <ChatToolActionsContext.Provider value={stableAddToolOutput}>
      {children}
    </ChatToolActionsContext.Provider>
  );
}

export function useChatToolActions(): ChatAddToolOutput {
  const ctx = useContext(ChatToolActionsContext);
  if (!ctx) {
    throw new Error("useChatToolActions must be used within ChatToolActionsProvider");
  }
  return ctx;
}

export function useOptionalChatToolActions(): ChatAddToolOutput | null {
  return useContext(ChatToolActionsContext);
}
