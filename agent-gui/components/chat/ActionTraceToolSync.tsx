"use client";

import { useEffect, useRef } from "react";
import { buildActionTraceTabId } from "@/lib/action-trace-tab-id";
import {
  hydrateActionTraceFromArtifact,
  readTraceRefFromToolData,
} from "@/lib/action-trace-artifact-client";
import { startActionTraceFeed } from "@/lib/action-trace-feed-client";
import {
  getActionTraceTab,
  hydrateActionTraceFromToolOutput,
} from "@/lib/action-trace-overlay";
import {
  isQkrpcActionCommandTool,
  readQkrpcActionIdFromInput,
  readQkrpcActionParamFromInput,
  resolveQkrpcActionRunMode,
} from "@/lib/qkrpc-action-tool";
import {
  isQkrpcToolResult,
  readQkrpcToolOutputData,
} from "@/components/chat/tool-output";
import { useChatStore } from "@/lib/use-chat-store";

type ActionTraceToolSyncProps = {
  toolName: string;
  input: unknown;
  output: unknown;
  isRunning: boolean;
};

/** Subscribe trace feed while Agent trace runs; hydrate from artifact when SSE missed events. */
export function ActionTraceToolSync({
  toolName,
  input,
  output,
  isRunning,
}: ActionTraceToolSyncProps) {
  const syncedKeyRef = useRef<string | null>(null);
  const preparedKeyRef = useRef<string | null>(null);
  const { store, defaultCwd } = useChatStore();
  const cwd = store.workingDirectory.trim() || defaultCwd.trim();

  useEffect(() => {
    if (!isQkrpcActionCommandTool(toolName, input)) return;

    const outputData = readQkrpcToolOutputData(output);
    if (resolveQkrpcActionRunMode(input, outputData) !== "debug") return;

    const actionId = readQkrpcActionIdFromInput(input);
    if (!actionId) return;

    const param = readQkrpcActionParamFromInput(input);
    const prepareKey = `${toolName}:${actionId}:${param ?? ""}`;

    if (isRunning) {
      if (preparedKeyRef.current !== prepareKey) {
        preparedKeyRef.current = prepareKey;
        startActionTraceFeed({ actionId, param });
      }
      return;
    }

    if (!output || !isQkrpcToolResult(output) || !output.ok) return;
    if (!outputData) return;

    const tabId = buildActionTraceTabId(actionId, param);
    const existing = getActionTraceTab(tabId);
    if (existing && existing.events.length > 0) {
      return;
    }

    const events = outputData.events;
    const traceRef = readTraceRefFromToolData(outputData);
    const syncKey = `${toolName}:${actionId}:${Array.isArray(events) ? events.length : 0}:${traceRef?.path ?? ""}`;
    if (syncedKeyRef.current === syncKey) return;

    if (Array.isArray(events) && events.length > 0) {
      syncedKeyRef.current = syncKey;
      hydrateActionTraceFromToolOutput(outputData, {
        actionId,
        param,
      });
      return;
    }

    if (!traceRef || !cwd) return;

    syncedKeyRef.current = syncKey;
    void hydrateActionTraceFromArtifact(cwd, traceRef, {
      actionId,
      param,
    });
  }, [cwd, input, isRunning, output, toolName]);

  return null;
}
