"use client";

import { useCallback, useState } from "react";
import type { ChatThread } from "@/lib/chat-store";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  exportChatThread,
  type BuildChatThreadExportOptions,
} from "@/lib/chat-thread-export";
import { pushAppMessage } from "@/lib/app-messages";
import {
  ChatThreadExportDialog,
  type ChatThreadExportResult,
} from "@/components/chat/ChatThreadExportDialog";

type UseChatThreadExportDialogOptions = {
  disabled?: boolean;
};

export function useChatThreadExportDialog(
  options: UseChatThreadExportDialogOptions = {},
) {
  const { disabled = false } = options;
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ChatThreadExportResult | null>(
    null,
  );

  const closeExportDialog = useCallback(() => {
    setExportResult(null);
  }, []);

  const exportThread = useCallback(
    async (
      thread: ChatThread,
      exportOptions?: BuildChatThreadExportOptions,
    ) => {
      if (disabled || exporting) return;
      setExporting(true);
      try {
        const result = await exportChatThread(thread, exportOptions);
        if (!result.ok) {
          pushAppMessage({
            kind: "warning",
            title: "无法导出",
            body: "当前对话还没有消息。",
            autoDismissMs: 6000,
          });
          return;
        }
        setExportResult({
          path: result.path,
          filename: result.filename,
          exportsDirectory: result.exportsDirectory,
        });
      } catch (error) {
        pushAppMessage({
          kind: "error",
          title: "导出失败",
          body: error instanceof Error ? error.message : String(error),
          autoDismissMs: 10000,
        });
      } finally {
        setExporting(false);
      }
    },
    [disabled, exporting],
  );

  const exportDialog = (
    <ChatThreadExportDialog
      open={exportResult != null}
      result={exportResult}
      onClose={closeExportDialog}
    />
  );

  return {
    exporting,
    exportThread,
    exportDialog,
  };
}

export type ExportThreadLike = Pick<
  ChatThread,
  | "id"
  | "title"
  | "updatedAt"
  | "workingDirectory"
  | "titleGenerated"
  | "titleManual"
  | "actionDesigner"
  | "messages"
>;

export function exportThreadLikeWithLiveMessages(
  exportThread: (
    thread: ChatThread,
    exportOptions?: BuildChatThreadExportOptions,
  ) => Promise<void>,
  thread: ExportThreadLike,
  liveMessages?: AgentUIMessage[],
) {
  return exportThread(thread as ChatThread, { liveMessages });
}
