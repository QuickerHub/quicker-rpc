import { useCallback, useState } from "react";
import type { ChatThread } from "@/lib/chat-store";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  buildChatThreadExportPayload,
  persistChatThreadExport,
  type ChatThreadExportPayload,
} from "@/lib/chat-thread-export";
import type { ChatThreadExportResult } from "@/components/chat/ChatThreadExportDialog";

export type ToolTestExportMeta = {
  threadId: string;
  title: string;
  workingDirectory?: string;
  startedAt: number;
};

export function buildToolTestThreadStub(meta: ToolTestExportMeta): ChatThread {
  return {
    id: meta.threadId,
    title: meta.title,
    messages: [],
    updatedAt: meta.startedAt,
    workingDirectory: meta.workingDirectory,
    titleGenerated: true,
    titleManual: false,
    messageCount: 0,
  };
}

export function buildToolTestChatExportPayload(
  meta: ToolTestExportMeta,
  messages: AgentUIMessage[],
): ChatThreadExportPayload {
  const thread = buildToolTestThreadStub(meta);
  return buildChatThreadExportPayload(thread, messages, { liveMessages: messages });
}

export async function persistToolTestChatExport(
  meta: ToolTestExportMeta,
  messages: AgentUIMessage[],
): Promise<ChatThreadExportResult> {
  if (messages.length === 0) {
    throw new Error("No messages to export");
  }
  const payload = buildToolTestChatExportPayload(meta, messages);
  const persisted = await persistChatThreadExport(payload);
  return {
    path: persisted.path,
    filename: persisted.filename,
    exportsDirectory: persisted.exportsDirectory,
  };
}

export function useToolTestChatExport() {
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ChatThreadExportResult | null>(
    null,
  );

  const exportMessages = useCallback(
    async (
      meta: ToolTestExportMeta,
      messages: AgentUIMessage[],
      options?: { silent?: boolean },
    ): Promise<ChatThreadExportResult | null> => {
      if (exporting || messages.length === 0) return null;
      setExporting(true);
      try {
        const result = await persistToolTestChatExport(meta, messages);
        if (!options?.silent) {
          setExportResult(result);
        }
        return result;
      } finally {
        setExporting(false);
      }
    },
    [exporting],
  );

  const clearExportResult = useCallback(() => {
    setExportResult(null);
  }, []);

  return {
    exporting,
    exportMessages,
    exportResult,
    clearExportResult,
  };
}
