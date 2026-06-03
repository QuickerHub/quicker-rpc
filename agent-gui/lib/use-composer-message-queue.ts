"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SendTextMessage = (payload: { text: string }) => void;

/**
 * While the agent is busy, enqueue composer submits; drain one message each time
 * status returns to idle (busy: true → false).
 */
export function useComposerMessageQueue(busy: boolean, sendMessage: SendTextMessage) {
  const queueRef = useRef<string[]>([]);
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;
  const [queueLength, setQueueLength] = useState(0);

  const syncQueue = useCallback((next: string[]) => {
    queueRef.current = next;
    setQueueLength(next.length);
  }, []);

  const clearQueue = useCallback(() => {
    syncQueue([]);
  }, [syncQueue]);

  const enqueueOrSend = useCallback(
    (text: string) => {
      if (busy) {
        syncQueue([...queueRef.current, text]);
        return;
      }
      sendMessageRef.current({ text });
    },
    [busy, syncQueue],
  );

  useEffect(() => {
    if (busy) return;
    const pending = queueRef.current;
    if (pending.length === 0) return;
    const [next, ...rest] = pending;
    syncQueue(rest);
    sendMessageRef.current({ text: next });
  }, [busy, syncQueue]);

  return { queueLength, enqueueOrSend, clearQueue };
}
