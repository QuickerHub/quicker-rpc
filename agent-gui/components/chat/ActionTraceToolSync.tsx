"use client";

import { useEffect, useRef } from "react";
import {
  hydrateActionTraceFromToolOutput,
  prepareActionTraceTab,
} from "@/lib/action-trace-overlay";
import {
  isQkrpcActionCommandTool,
  isQkrpcActionTraceInput,
  readQkrpcActionIdFromInput,
  readQkrpcActionParamFromInput,
  resolveQkrpcActionCommandVerb,
} from "@/lib/qkrpc-action-tool";
import { isQkrpcToolResult } from "@/components/chat/tool-output";

type ActionTraceToolSyncProps = {
  toolName: string;
  input: unknown;
  output: unknown;
  isRunning: boolean;
};

/** Open trace tab while Agent debug runs; hydrate timeline when tool completes. */
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
    if (resolveQkrpcActionCommandVerb(toolName, input) !== "trace") return;
    if (!isQkrpcActionTraceInput(input)) return;

    const actionId = readQkrpcActionIdFromInput(input);
    if (!actionId) return;

    const param = readQkrpcActionParamFromInput(input);
    const prepareKey = `${toolName}:${actionId}:${param ?? ""}`;

    if (isRunning) {
      if (preparedKeyRef.current !== prepareKey) {
        preparedKeyRef.current = prepareKey;
        prepareActionTraceTab({ actionId, param });
      }
      return;
    }

    if (!output || !isQkrpcToolResult(output) || !output.ok) return;
    if (typeof output.data !== "object" || output.data === null || Array.isArray(output.data)) {
      return;
    }

    const data = output.data as Record<string, unknown>;
    const syncKey = `${toolName}:${actionId}:${Array.isArray(data.events) ? data.events.length : 0}`;
    if (syncedKeyRef.current === syncKey) return;

    const events = data.events;
    if (!Array.isArray(events) || events.length === 0) return;

    syncedKeyRef.current = syncKey;
    hydrateActionTraceFromToolOutput(data, {
      actionId,
      param,
    });
  }, [input, isRunning, output, toolName]);

  return null;
}
