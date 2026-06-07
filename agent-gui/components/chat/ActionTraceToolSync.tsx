"use client";

import { useEffect, useRef } from "react";
import { buildActionTraceTabId } from "@/lib/action-trace-tab-id";
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

type ActionTraceToolSyncProps = {
  toolName: string;
  input: unknown;
  output: unknown;
  isRunning: boolean;
};

/** Subscribe trace feed while Agent trace runs; hydrate only if streaming missed events. */
export function ActionTraceToolSync({
  toolName,
  input,
  output,
  isRunning,
}: ActionTraceToolSyncProps) {
  const syncedKeyRef = useRef<string | null>(null);
  const preparedKeyRef = useRef<string | null>(null);

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

    const syncKey = `${toolName}:${actionId}:${Array.isArray(outputData.events) ? outputData.events.length : 0}`;
    if (syncedKeyRef.current === syncKey) return;

    const events = outputData.events;
    if (!Array.isArray(events) || events.length === 0) return;

    syncedKeyRef.current = syncKey;
    hydrateActionTraceFromToolOutput(outputData, {
      actionId,
      param,
    });
  }, [input, isRunning, output, toolName]);

  return null;
}
