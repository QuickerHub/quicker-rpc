"use client";

import { isTextUIPart } from "ai";
import { useEffect, useRef } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { LlmProviderId } from "@/lib/llm-providers";

function hasUserTextMessage(messages: AgentUIMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      if (isTextUIPart(part) && part.text.trim()) return true;
    }
  }
  return false;
}

type UseAutoThreadTitleOptions = {
  threadId: string;
  messages: AgentUIMessage[];
  status: string;
  llmProvider: LlmProviderId;
  titleGenerated: boolean;
  titleManual: boolean;
  onTitle: (threadId: string, title: string) => void;
};

export function useAutoThreadTitle({
  threadId,
  messages,
  status,
  llmProvider,
  titleGenerated,
  titleManual,
  onTitle,
}: UseAutoThreadTitleOptions): void {
  const inflightRef = useRef(false);
  const onTitleRef = useRef(onTitle);
  onTitleRef.current = onTitle;

  useEffect(() => {
    if (titleManual || titleGenerated) return;
    if (status !== "ready") return;
    if (!hasUserTextMessage(messages)) return;
    if (inflightRef.current) return;

    inflightRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/chat/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, llmProvider }),
        });
        if (cancelled || !res.ok) return;

        const data = (await res.json()) as { title?: unknown };
        if (typeof data.title !== "string" || !data.title.trim()) return;

        onTitleRef.current(threadId, data.title.trim());
      } catch {
        /* keep provisional title from first user message */
      } finally {
        if (!cancelled) inflightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    threadId,
    messages,
    status,
    llmProvider,
    titleGenerated,
    titleManual,
  ]);
}
