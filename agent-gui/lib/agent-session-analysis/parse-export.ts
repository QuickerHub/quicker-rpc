import {
  CHAT_THREAD_EXPORT_FORMAT,
  CHAT_THREAD_EXPORT_VERSION,
  type ChatThreadExportPayload,
} from "@/lib/chat-thread-export";

export class ChatThreadExportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatThreadExportParseError";
  }
}

export function parseChatThreadExportJson(raw: unknown): ChatThreadExportPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ChatThreadExportParseError("Export must be a JSON object.");
  }

  const record = raw as Record<string, unknown>;
  if (record.format !== CHAT_THREAD_EXPORT_FORMAT) {
    throw new ChatThreadExportParseError(
      `Expected format "${CHAT_THREAD_EXPORT_FORMAT}", got ${String(record.format)}.`,
    );
  }
  if (record.version !== CHAT_THREAD_EXPORT_VERSION) {
    throw new ChatThreadExportParseError(
      `Unsupported export version ${String(record.version)} (expected ${CHAT_THREAD_EXPORT_VERSION}).`,
    );
  }
  if (!Array.isArray(record.messages)) {
    throw new ChatThreadExportParseError("Export is missing messages[].");
  }
  if (!record.thread || typeof record.thread !== "object") {
    throw new ChatThreadExportParseError("Export is missing thread metadata.");
  }

  return record as ChatThreadExportPayload;
}

export function parseChatThreadExportText(text: string): ChatThreadExportPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ChatThreadExportParseError(`Invalid JSON: ${message}`);
  }
  return parseChatThreadExportJson(parsed);
}
