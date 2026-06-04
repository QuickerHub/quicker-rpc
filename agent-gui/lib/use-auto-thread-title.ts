"use client";

import { isTextUIPart } from "ai";
import { useEffect, useRef } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import { deriveProvisionalThreadTitle } from "@/lib/thread-title";

function hasUserTextMessage(messages: AgentUIMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      if (isTextUIPart(part) && part.text.trim()) return true;
    }
  }
  return false;
}

function pickThreadTitle(
  messages: AgentUIMessage[],
  apiTitle: string | undefined,
): string | null {
  const trimmed = apiTitle?.trim();
  if (trimmed && trimmed !== "新对话") return trimmed;

  const provisional = deriveProvisionalThreadTitle(messages);
  if (provisional && provisional !== "新对话") return provisional;

  return trimmed || null;
}

type UseAutoThreadTitleOptions = {
  threadId: string;
  messages: AgentUIMessage[];
  status: string;
  llmSelection: string;
  currentTitle: string;
  titleGenerated: boolean;
  titleManual: boolean;
  onTitle: (threadId: string, title: string) => void;
};

export function useAutoThreadTitle({
  threadId,
  messages,
  status,
  llmSelection,
  currentTitle,
  titleGenerated,
  titleManual,
  onTitle,
}: UseAutoThreadTitleOptions): void {
  const inflightRef = useRef(false);
  const onTitleRef = useRef(onTitle);
  onTitleRef.current = onTitle;

  useEffect(() => {
    if (titleManual) return;
    if (titleGenerated && currentTitle.trim() !== "新对话") return;
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
          body: JSON.stringify({ messages, llmSelection }),
        });

        let apiTitle: string | undefined;
        if (res.ok) {
          const data = (await res.json()) as { title?: unknown };
          if (typeof data.title === "string") apiTitle = data.title;
        }

        if (cancelled) return;
        const title = pickThreadTitle(messages, apiTitle);
        if (!title) return;

        onTitleRef.current(threadId, title);
      } catch {
        if (cancelled) return;
        const fallback = pickThreadTitle(messages, undefined);
        if (fallback) onTitleRef.current(threadId, fallback);
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
    llmSelection,
    currentTitle,
    titleGenerated,
    titleManual,
  ]);
}
