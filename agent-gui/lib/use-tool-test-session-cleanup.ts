"use client";

import { useCallback, useState } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  cleanupToolTestChatSession,
  formatToolTestCleanupHint,
} from "@/lib/tool-test-chat-cleanup";

type UseToolTestSessionCleanupOptions = {
  workingDirectory?: string;
  getMessages: () => AgentUIMessage[];
  onCleared: () => void;
  clearedLabel?: string;
  onBeforeCleanup?: () => void;
};

export function useToolTestSessionCleanup({
  workingDirectory,
  getMessages,
  onCleared,
  clearedLabel,
  onBeforeCleanup,
}: UseToolTestSessionCleanupOptions) {
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupHint, setCleanupHint] = useState<string | null>(null);

  const cleanupSession = useCallback(async () => {
    if (cleanupBusy) return;
    setCleanupBusy(true);
    setCleanupHint(null);
    onBeforeCleanup?.();

    try {
      const result = await cleanupToolTestChatSession({
        cwd: workingDirectory,
        messages: getMessages(),
      });
      onCleared();
      setCleanupHint(formatToolTestCleanupHint(result, clearedLabel));
    } finally {
      setCleanupBusy(false);
    }
  }, [
    cleanupBusy,
    clearedLabel,
    getMessages,
    onBeforeCleanup,
    onCleared,
    workingDirectory,
  ]);

  const clearCleanupHint = useCallback(() => {
    setCleanupHint(null);
  }, []);

  return {
    cleanupSession,
    cleanupBusy,
    cleanupHint,
    clearCleanupHint,
  };
}
