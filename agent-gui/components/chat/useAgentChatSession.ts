"use client";

import { useChat } from "@ai-sdk/react";
import { convertFileListToFileUIParts } from "ai";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
import { replaceChatMessagesIfCurrent } from "@/lib/chat-message-edit-branch";
import { createLiveProgramDocumentTurn } from "@/lib/live-program-document-turn";
import type { LiveProgramDocumentRegistry, LiveProgramDocumentPin, LiveProgramDocumentRegistryFailure } from "@/lib/live-program-document";

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
  const liveRegistryRef = useRef<LiveProgramDocumentRegistry | null>(null);
  const liveTurn = useMemo(() => createLiveProgramDocumentTurn({ threadId, getRegistry: () => liveRegistryRef.current }), [threadId]);
  const addLiveToolOutputRef = useRef<((input: { tool: string; toolCallId: string; output: unknown }) => Promise<void>) | null>(null);

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
        liveProgramDocumentTurn: liveTurn.getBody,
      }),
    [threadId, liveTurn],
  );

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    stop: stopSdk,
    clearError,
    addToolApprovalResponse,
    addToolOutput,
  } = useChat<AgentUIMessage>({
    id: threadId,
    messages: finalizeStreamingReasoningParts(initialMessages),
    transport: chatTransport,
    experimental_throttle: 100,
    sendAutomaticallyWhen: (input) => !(liveTurn.getBody() && liveTurn.isStopped()) && lastAssistantMessageIsCompleteWithClientResponses(input),
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName !== "workspace_program" || !liveTurn.getBody() || liveTurn.isStopped()) return;
      const generation = liveTurn.getGeneration();
      const output = await liveTurn.executeAsync(toolCall.toolCallId, toolCall.input);
      if (liveTurn.getGeneration() !== generation || liveTurn.isStopped()) return;
      // The SDK is processing this stream. Awaiting its automatic continuation
      // here would wait on the same stream callback; record first, publish once.
      void addLiveToolOutputRef.current?.({ tool: "workspace_program", toolCallId: toolCall.toolCallId, output }).catch(() => {
        // The immutable receipt remains available to stop/repair; never replay an edit.
      });
    },
  });
  addLiveToolOutputRef.current = addToolOutput as typeof addLiveToolOutputRef.current;

  useLayoutEffect(() => () => liveTurn.dispose(), [liveTurn]);
  const registerLiveProgramDocumentRegistry = useCallback((registry: LiveProgramDocumentRegistry) => {
    liveRegistryRef.current = registry;
    return () => { if (liveRegistryRef.current === registry) liveRegistryRef.current = null; };
  }, []);
  const rememberLiveProgramDocumentPin = useCallback((tagId: string, pin?: LiveProgramDocumentPin | LiveProgramDocumentRegistryFailure) => {
    liveTurn.rememberPin(tagId, pin);
  }, [liveTurn]);
  const stop = useCallback(() => { liveTurn.stop(); return stopSdk(); }, [liveTurn, stopSdk]);

  messagesForPersistRef.current = messages;

  const replaceMessagesIfCurrent = useCallback((expected: AgentUIMessage[], next: AgentUIMessage[]) =>
    replaceChatMessagesIfCurrent(setMessages, expected, next), [setMessages]);

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
    setMessages((prev) => repairInterruptedToolCalls(prev, liveTurn.getResult));
  }, [setMessages, liveTurn]);

  const sendMessageSafe = useCallback(
    async (payload: Parameters<typeof sendMessage>[0]) => {
      repairToolCalls();
      if (!payload) return sendMessage();
      const id = payload.messageId ?? ("id" in payload && typeof payload.id === "string" ? payload.id : crypto.randomUUID());
      const text = "text" in payload ? payload.text ?? "" : "parts" in payload
        ? payload.parts?.filter((part) => part.type === "text").map((part) => part.text).join("\n") ?? "" : "";
      liveTurn.begin({ userMessageId: id, text, cwd: workingDirectoryRef.current.trim(), chatMode: chatModeRef.current,
        enabledTools: enabledToolsRef.current });
      // The SDK's shorthand {text, files} branch discards a supplied id. Send
      // parts so the grant and the actual original user message share one ID.
      if ("text" in payload || "files" in payload) {
        const generation = liveTurn.getGeneration();
        const files = !payload.files ? [] : Array.isArray(payload.files) ? payload.files : await convertFileListToFileUIParts(payload.files);
        if (liveTurn.isStopped() || liveTurn.getGeneration() !== generation) return;
        return sendMessage({ id, role: "user", parts: [...files, ...(text ? [{ type: "text" as const, text }] : [])],
          metadata: payload.metadata, messageId: payload.messageId });
      }
      return sendMessage({ ...payload, id });
    },
    [repairToolCalls, sendMessage, liveTurn],
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
    // stop() repairs what is present immediately. The SDK can still deliver
    // buffered calls afterward; repair the drained store without executing them.
    if (!liveTurn.getBody() || !liveTurn.isStopped() || (status !== "ready" && status !== "error")) return;
    const repaired = liveTurn.repairAfterStoppedDrain(messages, status);
    // The SDK setter always copies/notifies, even for the same array. Do not
    // call it for an already finalized snapshot or this effect repeats forever.
    if (repaired !== messages) setMessages(repaired);
  }, [messages, status, liveTurn, setMessages]);
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
    replaceMessagesIfCurrent,
    status,
    error,
    stop,
    clearError,
    addToolApprovalResponse,
    addToolOutput,
    repairToolCalls,
    busyPersist,
    registerLiveProgramDocumentRegistry,
    rememberLiveProgramDocumentPin,
  };
}
