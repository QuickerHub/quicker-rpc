import { generateId } from "ai";
import type { ChatThreadExportResult } from "@/components/chat/ChatThreadExportDialog";
import type { AgentUIMessage } from "@/lib/chat-types";

export const BENCH_EXPORT_NOTICE_HEADING = "QuickerBench 对话已导出";

export function buildBenchExportNoticeText(
  result: ChatThreadExportResult,
  options?: { mockSummary?: string | null },
): string {
  const lines = [
    `**${BENCH_EXPORT_NOTICE_HEADING}**`,
    "",
    `- 文件：\`${result.filename}\``,
    `- 路径：\`${result.path}\``,
  ];
  if (result.exportsDirectory) {
    lines.push(`- 目录：\`${result.exportsDirectory}\``);
  }
  if (options?.mockSummary) {
    lines.push(`- Mock：${options.mockSummary}`);
  }
  lines.push("", "可将 JSON 用于 session-analysis 或 Cursor 会话复盘。");
  return lines.join("\n");
}

export function isBenchExportNoticeMessage(
  message: AgentUIMessage,
  exportPath?: string,
): boolean {
  if (message.role !== "assistant") return false;
  const textPart = message.parts.find((part) => part.type === "text");
  const text = textPart && "text" in textPart ? textPart.text : "";
  if (!text.includes(BENCH_EXPORT_NOTICE_HEADING)) return false;
  if (exportPath) return text.includes(exportPath);
  return true;
}

export function appendBenchExportNotice(
  messages: AgentUIMessage[],
  result: ChatThreadExportResult,
  options?: { mockSummary?: string | null },
): AgentUIMessage[] {
  const last = messages[messages.length - 1];
  if (last && isBenchExportNoticeMessage(last, result.path)) {
    return messages;
  }
  return [
    ...messages,
    {
      id: generateId(),
      role: "assistant",
      parts: [{ type: "text", text: buildBenchExportNoticeText(result, options) }],
    },
  ];
}
