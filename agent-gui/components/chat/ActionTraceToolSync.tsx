"use client";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import { readTraceRunOwner, sameTraceRunOwner } from "@/lib/action-trace-owner";
import { hydrateActionTraceFromArtifact, readTraceRefFromToolData } from "@/lib/action-trace-artifact-client";
import { startActionTraceFeed } from "@/lib/action-trace-feed-client";
import { prepareOwnedTraceView, prepareHistoricalTraceView } from "@/lib/action-trace-overlay";
import { QKRPC_ACTION_DEBUG_TOOL, isQkrpcActionCommandTool, readQkrpcActionIdFromInput, readQkrpcActionParamFromInput, resolveQkrpcActionRunMode } from "@/lib/qkrpc-action-tool";
import { readQkrpcToolOutputData } from "./tool-output";
type MessageOwner = {
  threadId: string;
  cwd: string;
  messageId: string;
};
const TraceMessageContext = createContext<MessageOwner | undefined>(undefined);
export function ActionTraceMessageProvider({ threadId, cwd, message, live, children }: {
  threadId?: string;
  cwd: string;
  message: AgentUIMessage;
  live: boolean;
  children: ReactNode;
}) {
  const context = useMemo(() => threadId ? { threadId, cwd, messageId: message.id } : undefined, [threadId, cwd, message.id]);
  const feeds = useRef(new Map<string, () => void>());
  const reads = useRef(new Map<string, AbortController>());
  const hydrated = useRef(new Set<string>());
  useEffect(() => {
    if (!context)
      return;
    for (const part of message.parts) {
      if (part.type !== "data-actionTrace")
        continue;
      const event = part.data;
      const owner = readTraceRunOwner(event.owner);
      if (!owner)
        continue;
      const isLive = live && owner.executionId === message.metadata?.executionId
        && owner.threadId === context.threadId;
      if (event.kind === "start") {
        if (!isLive) {
          const hasTerminal = message.parts.some((item) => item.type === "data-actionTrace"
            && item.data.kind !== "start" && readTraceRunOwner(item.data.owner)
            && sameTraceRunOwner(owner, readTraceRunOwner(item.data.owner)!));
          if (!hasTerminal) prepareOwnedTraceView(owner, false, { threadId: context.threadId, messageId: context.messageId })
            ?.observeError("无持久化终态，原生结果未知");
          continue;
        }
        if (feeds.current.has(owner.runId))
          continue;
        const view = prepareOwnedTraceView(owner, true);
        if (view)
          feeds.current.set(owner.runId, startActionTraceFeed(owner, view));
        continue;
      }
      const view = prepareOwnedTraceView(owner, false, { threadId: context.threadId, messageId: context.messageId });
      if (!view)
        continue;
      if (event.kind === "terminal") {
        view.finish(event.data);
        continue;
      }
      const ref = readTraceRefFromToolData(event.data);
      view.finish(event.data);
      const key = `${view.tabId}:${ref?.path}`;
      if (ref && !reads.current.has(key) && !hydrated.current.has(key)) {
        const abort = new AbortController();
        reads.current.set(key, abort);
        void hydrateActionTraceFromArtifact(view.cwd, ref, { view, signal: abort.signal }).then((ok) => {
          if (ok && !abort.signal.aborted)
            hydrated.current.add(key);
        }).finally(() => { if (reads.current.get(key) === abort)
          reads.current.delete(key); });
      }
    }
  }, [context, message.parts, message.metadata?.executionId, live]);
  useEffect(() => () => {
    for (const release of feeds.current.values())
      release();
    feeds.current.clear();
    for (const abort of reads.current.values())
      abort.abort();
    reads.current.clear();
    hydrated.current.clear();
  }, [context]);
  return <TraceMessageContext.Provider value={context}>{children}</TraceMessageContext.Provider>;
}
/** Completed messages hydrate only their captured view; history never starts a native run/feed. */
export function ActionTraceToolSync({ toolName, input, output, isRunning, partKey }: {
  toolName: string;
  input: unknown;
  output: unknown;
  isRunning: boolean;
  partKey: string;
}) {
  const context = useContext(TraceMessageContext);
  useEffect(() => {
    if (!context || isRunning || !output || !isQkrpcActionCommandTool(toolName, input))
      return;
    const data = readQkrpcToolOutputData(output);
    if (!data || toolName !== QKRPC_ACTION_DEBUG_TOOL && resolveQkrpcActionRunMode(input, data) !== "debug")
      return;
    const actionId = readQkrpcActionIdFromInput(input);
    if (!actionId)
      return;
    const param = readQkrpcActionParamFromInput(input);
    const owner = readTraceRunOwner(data.traceOwner);
    if (data.traceOwner !== undefined && !owner)
      return;
    const view = owner ? prepareOwnedTraceView(owner, false, { threadId: context.threadId, messageId: context.messageId })
      : prepareHistoricalTraceView({ ...context, partKey, actionId, param });
    if (!view)
      return;
    const abort = new AbortController();
    const ref = readTraceRefFromToolData(data);
    if (Array.isArray(data.events) && data.events.length)
      view.hydrate(data);
    else if (ref)
      void hydrateActionTraceFromArtifact(view.cwd, ref, { view, signal: abort.signal });
    else
      view.finish(data);
    return () => abort.abort();
  }, [context, input, output, isRunning, toolName, partKey]);
  return null;
}
