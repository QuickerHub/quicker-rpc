"use client";

import { useEffect, useRef } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import { deriveProvisionalThreadTitle } from "@/lib/thread-title";
import {
  extractThreadTitleFromMessages,
  isFirstChatUserTurn,
} from "@/lib/thread-title-tool-messages";

type UseThreadTitleFromToolOptions = {
  threadId: string;
  visible: boolean;
  messages: AgentUIMessage[];
  status: string;
  currentTitle: string;
  titleGenerated: boolean;
  titleManual: boolean;
  onTitle: (threadId: string, title: string) => void;
};

/**
 * Apply sidebar title from the agent's hidden set_thread_title tool during stream.
 * Falls back to a truncated provisional title only after the first reply finishes
 * without the tool (first user turn only).
 */
export function useThreadTitleFromTool({
  threadId,
  visible,
  messages,
  status,
  currentTitle,
  titleGenerated,
  titleManual,
  onTitle,
}: UseThreadTitleFromToolOptions): void {
  const onTitleRef = useRef(onTitle);
  onTitleRef.current = onTitle;
  const appliedTitleRef = useRef<string | null>(null);
  const fallbackDoneRef = useRef(false);

  useEffect(() => {
    appliedTitleRef.current = null;
    fallbackDoneRef.current = false;
  }, [threadId]);

  useEffect(() => {
    if (!visible || titleManual) return;
    if (titleGenerated && currentTitle.trim() !== "新对话") return;

    const fromTool = extractThreadTitleFromMessages(messages);
    if (fromTool && fromTool !== appliedTitleRef.current) {
      appliedTitleRef.current = fromTool;
      fallbackDoneRef.current = true;
      onTitleRef.current(threadId, fromTool);
      return;
    }

    if (status !== "ready" || fallbackDoneRef.current) return;
    if (!isFirstChatUserTurn(messages)) return;

    const hasAssistantReply = messages.some((m) => m.role === "assistant");
    if (!hasAssistantReply) return;

    fallbackDoneRef.current = true;
    const provisional = deriveProvisionalThreadTitle(messages);
    if (provisional && provisional !== "新对话") {
      onTitleRef.current(threadId, provisional);
    }
  }, [
    threadId,
    visible,
    messages,
    status,
    currentTitle,
    titleGenerated,
    titleManual,
  ]);
}
