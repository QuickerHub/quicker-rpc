import type { AgentUIMessage, SessionUsage } from "@/lib/chat-types";
import { aggregateSessionUsage } from "@/lib/chat-types";
import type { ChatThread } from "@/lib/chat-store";
import { resolveThreadMessagesAsync } from "@/lib/chat-store";
import { plainTitleText } from "@/lib/plain-title-text";

export const CHAT_THREAD_EXPORT_FORMAT = "quicker-agent-chat-export";
export const CHAT_THREAD_EXPORT_VERSION = 1;

export type ChatThreadExportThreadMeta = {
  id: string;
  title: string;
  updatedAt: number;
  workingDirectory?: string;
  titleGenerated?: boolean;
  titleManual?: boolean;
  actionDesigner?: ChatThread["actionDesigner"];
};

export type ChatThreadExportStats = {
  messageCount: number;
  userTurnCount: number;
  sessionUsage: SessionUsage;
};

/** JSON export shape for offline agent analysis (prompts, skills, rubrics). */
export type ChatThreadExportPayload = {
  format: typeof CHAT_THREAD_EXPORT_FORMAT;
  version: typeof CHAT_THREAD_EXPORT_VERSION;
  exportedAt: string;
  thread: ChatThreadExportThreadMeta;
  stats: ChatThreadExportStats;
  messages: AgentUIMessage[];
};

export type BuildChatThreadExportOptions = {
  exportedAt?: number;
  liveMessages?: AgentUIMessage[];
};

export function countUserTurns(messages: AgentUIMessage[]): number {
  return messages.reduce(
    (count, message) => count + (message.role === "user" ? 1 : 0),
    0,
  );
}

export function buildChatThreadExportPayload(
  thread: ChatThread,
  messages: AgentUIMessage[],
  options?: BuildChatThreadExportOptions,
): ChatThreadExportPayload {
  const exportedAtMs = options?.exportedAt ?? Date.now();
  const snapshot = options?.liveMessages?.length
    ? options.liveMessages
    : messages;

  return {
    format: CHAT_THREAD_EXPORT_FORMAT,
    version: CHAT_THREAD_EXPORT_VERSION,
    exportedAt: new Date(exportedAtMs).toISOString(),
    thread: {
      id: thread.id,
      title: thread.title,
      updatedAt: thread.updatedAt,
      workingDirectory: thread.workingDirectory,
      titleGenerated: thread.titleGenerated,
      titleManual: thread.titleManual,
      actionDesigner: thread.actionDesigner,
    },
    stats: {
      messageCount: snapshot.length,
      userTurnCount: countUserTurns(snapshot),
      sessionUsage: aggregateSessionUsage(snapshot),
    },
    messages: snapshot,
  };
}

export function serializeChatThreadExport(payload: ChatThreadExportPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function buildChatThreadExportFilename(
  thread: Pick<ChatThread, "id" | "title">,
  exportedAt = Date.now(),
): string {
  const stamp = new Date(exportedAt)
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-");
  const slug =
    plainTitleText(thread.title)
      .slice(0, 48)
      .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "chat";
  const shortId = thread.id.slice(0, 8);
  return `quicker-agent-${slug}-${shortId}-${stamp}.json`;
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "application/json;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export function downloadChatThreadExport(payload: ChatThreadExportPayload): string {
  const filename = buildChatThreadExportFilename(payload.thread, Date.parse(payload.exportedAt));
  downloadTextFile(filename, serializeChatThreadExport(payload));
  return filename;
}

export type PersistChatThreadExportResult = {
  path: string;
  filename: string;
  exportsDirectory: string;
};

export async function persistChatThreadExport(
  payload: ChatThreadExportPayload,
): Promise<PersistChatThreadExportResult> {
  const response = await fetch("/api/chat-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  const data = (await response.json()) as {
    ok?: boolean;
    path?: string;
    filename?: string;
    exportsDirectory?: string;
    error?: string;
  };
  if (!response.ok || !data.ok || !data.path || !data.filename) {
    throw new Error(data.error ?? `Export failed (HTTP ${response.status})`);
  }
  return {
    path: data.path,
    filename: data.filename,
    exportsDirectory: data.exportsDirectory ?? "",
  };
}

export async function resolveMessagesForExport(
  thread: ChatThread,
  liveMessages?: AgentUIMessage[],
): Promise<AgentUIMessage[]> {
  if (liveMessages && liveMessages.length > 0) {
    return liveMessages;
  }
  if (thread.messages.length > 0) {
    return thread.messages;
  }
  const resolved = await resolveThreadMessagesAsync(thread.id);
  return resolved.messages;
}

export async function exportChatThread(
  thread: ChatThread,
  options?: BuildChatThreadExportOptions,
): Promise<
  | { ok: true; path: string; filename: string; exportsDirectory: string }
  | { ok: false; reason: "empty" }
> {
  const messages = await resolveMessagesForExport(thread, options?.liveMessages);
  if (messages.length === 0) {
    return { ok: false, reason: "empty" };
  }

  const payload = buildChatThreadExportPayload(thread, messages, options);
  const persisted = await persistChatThreadExport(payload);
  return { ok: true, ...persisted };
}
