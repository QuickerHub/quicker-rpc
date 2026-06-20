"use client";

import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { ChatMode } from "@/lib/chat-mode";
import { lastAssistantMessageIsCompleteWithClientResponses } from "@/lib/chat-auto-submit";
import {
  createAgentChatTransport,
  type ActionDesignerChatRef,
} from "@/lib/agent-chat-transport";
import {
  finalizeStreamingReasoningParts,
  repairInterruptedToolCalls,
} from "@/lib/repair-interrupted-tool-calls";
import {
  flushPendingChatStoreSaveAsync,
} from "@/lib/chat-store";
import { isChatStoreHydrated } from "@/lib/use-chat-store";

const CHAT_PERSIST_DEBOUNCE_MS = 400;
const CHAT_PERSIST_MAX_INTERVAL_MS = 5000;

export type ChatThreadPersistHandler = (
  threadId: string,
  messages: AgentUIMessage[],
  options?: { notify?: boolean },
) => void;

export type UseAgentChatSessionOptions = {
  threadId: string;
  initialMessages: AgentUIMessage[];
  ephemeral: boolean;
  visible: boolean;
  workingDirectory: string;
  titleManual: boolean;
  designerEmbedScoped?: boolean;
  actionDesigner?: ActionDesignerChatRef;
  chatMode: ChatMode;
  enabledTools: string[];
  llmSelection: string;
  onPersist: ChatThreadPersistHandler;
  benchMode?: boolean;
};

/** useChat + stable transport body + thread hydration + debounced persistence. */
export function useAgentChatSession(options: UseAgentChatSessionOptions) {
  const {
    threadId,
    initialMessages,
    ephemeral,
    visible,
    workingDirectory,
    titleManual,
    designerEmbedScoped = false,
    actionDesigner,
    chatMode,
    enabledTools,
    llmSelection,
    onPersist,
    benchMode = false,
  } = options;

  const benchModeRef = useRef(benchMode);
  benchModeRef.current = benchMode;

  const persistRef = useRef(onPersist);
  persistRef.current = onPersist;
  const lastPersistedRef = useRef<{
    threadId: string;
    messages: AgentUIMessage[];
  } | null>(null);

  const enabledToolsRef = useRef(enabledTools);
  enabledToolsRef.current = enabledTools;
  const chatModeRef = useRef(chatMode);
  chatModeRef.current = chatMode;
  const llmSelectionRef = useRef(llmSelection);
  llmSelectionRef.current = llmSelection;
  const workingDirectoryRef = useRef(workingDirectory);
  workingDirectoryRef.current = workingDirectory;
  const titleManualRef = useRef(titleManual);
  titleManualRef.current = titleManual;
  const designerEmbedScopedRef = useRef(designerEmbedScoped);
  designerEmbedScopedRef.current = designerEmbedScoped;
  const actionDesignerRef = useRef(actionDesigner);
  actionDesignerRef.current = designerEmbedScoped ? actionDesigner : undefined;
  const messagesForPersistRef = useRef<AgentUIMessage[]>(initialMessages);

  const chatTransport = useMemo(
    () =>
      createAgentChatTransport({
        threadId,
        chatMode: chatModeRef,
        enabledTools: enabledToolsRef,
        llmSelection: llmSelectionRef,
        workingDirectory: workingDirectoryRef,
        titleManual: titleManualRef,
        designerEmbedScoped: designerEmbedScopedRef,
        actionDesigner: actionDesignerRef,
        benchMode: benchModeRef,
      }),
    [threadId],
  );

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    stop,
    clearError,
    addToolApprovalResponse,
    addToolOutput,
  } = useChat<AgentUIMessage>({
    id: threadId,
    messages: finalizeStreamingReasoningParts(initialMessages),
    transport: chatTransport,
    experimental_throttle: 100,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithClientResponses,
  });

  messagesForPersistRef.current = messages;

  useEffect(() => {
    if (ephemeral) return;
    if (initialMessages.length === 0) return;
    if (status === "streaming" || status === "submitted") return;
    const live = messagesForPersistRef.current;
    if (live.length > 0) return;
    setMessages(finalizeStreamingReasoningParts(initialMessages));
  }, [ephemeral, initialMessages, setMessages, status, threadId]);

  const busyPersist = status === "streaming" || status === "submitted";
  const busyPersistRef = useRef(busyPersist);
  busyPersistRef.current = busyPersist;

  const flushThreadPersist = useCallback(() => {
    if (!isChatStoreHydrated()) return;
    const snapshot = messagesForPersistRef.current;
    lastPersistedRef.current = { threadId, messages: snapshot };
    persistRef.current(threadId, snapshot, {
      notify: !busyPersistRef.current,
    });
  }, [threadId]);

  const repairToolCalls = useCallback(() => {
    setMessages((prev) => repairInterruptedToolCalls(prev));
  }, [setMessages]);

  const sendMessageSafe = useCallback(
    (payload: Parameters<typeof sendMessage>[0]) => {
      repairToolCalls();
      sendMessage(payload);
    },
    [repairToolCalls, sendMessage],
  );

  useEffect(() => {
    if (ephemeral || !visible) return;
    const debounceMs = busyPersist
      ? CHAT_PERSIST_MAX_INTERVAL_MS
      : CHAT_PERSIST_DEBOUNCE_MS;
    const timer = window.setTimeout(flushThreadPersist, debounceMs);
    return () => {
      window.clearTimeout(timer);
      if (!busyPersist) {
        flushThreadPersist();
      }
    };
  }, [busyPersist, ephemeral, flushThreadPersist, messages, visible]);

  useEffect(() => {
    if (ephemeral || !visible) return;
    if (status !== "submitted") return;
    flushThreadPersist();
  }, [ephemeral, flushThreadPersist, status, visible]);

  const flushThreadPersistToDisk = useCallback(() => {
    flushThreadPersist();
    void flushPendingChatStoreSaveAsync({ keepalive: true });
  }, [flushThreadPersist]);

  useEffect(() => {
    if (ephemeral || !visible) return;
    const interval = window.setInterval(
      flushThreadPersist,
      CHAT_PERSIST_MAX_INTERVAL_MS,
    );
    const onPageHide = () => flushThreadPersistToDisk();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", onPageHide);
      flushThreadPersistToDisk();
    };
  }, [ephemeral, flushThreadPersist, flushThreadPersistToDisk, threadId, visible]);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    const wasBusy = prev === "streaming" || prev === "submitted";
    const isIdle = status === "ready" || status === "error";
    if (!wasBusy || !isIdle) return;
    setMessages((current) => finalizeStreamingReasoningParts(current));
    if (!ephemeral) {
      flushThreadPersist();
    }
  }, [ephemeral, flushThreadPersist, setMessages, status]);

  return {
    messages,
    sendMessage,
    sendMessageSafe,
    setMessages,
    status,
    error,
    stop,
    clearError,
    addToolApprovalResponse,
    addToolOutput,
    repairToolCalls,
    busyPersist,
  };
}
