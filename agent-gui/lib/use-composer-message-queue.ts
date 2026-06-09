"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SendTextMessage = (payload: { text: string }) => void;

/**
 * While the agent is busy, enqueue composer submits; drain one message each time
 * status returns to idle (busy: true → false). Call flushNextQueuedNow to interrupt
 * the current run and send the head of the queue immediately.
 */
export function useComposerMessageQueue(
  busy: boolean,
  sendMessage: SendTextMessage,
  onInterrupt: () => void,
) {
  const queueRef = useRef<string[]>([]);
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;
  const onInterruptRef = useRef(onInterrupt);
  onInterruptRef.current = onInterrupt;
  const suppressAutoDrainRef = useRef(false);
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);

  const syncQueue = useCallback((next: string[]) => {
    queueRef.current = next;
    setQueuedMessages(next);
  }, []);

  const clearQueue = useCallback(() => {
    syncQueue([]);
  }, [syncQueue]);

  const removeFromQueue = useCallback(
    (index: number) => {
      const current = queueRef.current;
      if (index < 0 || index >= current.length) return;
      syncQueue(current.filter((_, i) => i !== index));
    },
    [syncQueue],
  );

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

  const flushNextQueuedNow = useCallback((): boolean => {
    const pending = queueRef.current;
    if (pending.length === 0) return false;
    const [next, ...rest] = pending;
    suppressAutoDrainRef.current = true;
    syncQueue(rest);
    onInterruptRef.current();
    sendMessageRef.current({ text: next });
    return true;
  }, [syncQueue]);

  useEffect(() => {
    if (busy) {
      suppressAutoDrainRef.current = false;
      return;
    }
    if (suppressAutoDrainRef.current) return;
    const pending = queueRef.current;
    if (pending.length === 0) return;
    const [next, ...rest] = pending;
    syncQueue(rest);
    sendMessageRef.current({ text: next });
  }, [busy, syncQueue]);

  return {
    queueLength: queuedMessages.length,
    queuedMessages,
    enqueueOrSend,
    clearQueue,
    removeFromQueue,
    flushNextQueuedNow,
  };
}
