import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  CHAT_THREAD_EXPORT_FORMAT,
  CHAT_THREAD_EXPORT_VERSION,
  type ChatThreadExportPayload,
} from "@/lib/chat-thread-export";
import {
  CHAT_EXPORTS_SUBDIR,
  resolvePathWithinRevealScope,
  resolveRevealScopeRoot,
} from "@/lib/reveal-path-in-file-manager.server";

export { CHAT_EXPORTS_SUBDIR };

export function resolveChatExportsDirectory(): string {
  return resolveRevealScopeRoot("chat-exports");
}

export function writeChatThreadExportFile(
  filename: string,
  content: string,
): { path: string; exportsDirectory: string } {
  const safeName = basename(filename.trim());
  if (!safeName || safeName !== filename.trim()) {
    throw new Error("Invalid export filename");
  }
  if (!safeName.endsWith(".json")) {
    throw new Error("Export filename must end with .json");
  }

  const exportsDirectory = resolveChatExportsDirectory();
  mkdirSync(exportsDirectory, { recursive: true });
  const path = join(exportsDirectory, safeName);
  writeFileSync(path, content, "utf8");
  return { path, exportsDirectory };
}

/** @deprecated Prefer resolvePathWithinRevealScope('chat-exports', path) */
export function resolveExportPathWithinExportsDir(filePath: string): string {
  return resolvePathWithinRevealScope("chat-exports", filePath, {
    mustExist: true,
  });
}

export function parseChatThreadExportPayload(raw: unknown): ChatThreadExportPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Export payload must be an object");
  }
  const payload = raw as Partial<ChatThreadExportPayload>;
  if (payload.format !== CHAT_THREAD_EXPORT_FORMAT) {
    throw new Error("Unsupported export payload format");
  }
  if (payload.version !== CHAT_THREAD_EXPORT_VERSION) {
    throw new Error("Unsupported export payload version");
  }
  if (!payload.thread || typeof payload.thread.id !== "string") {
    throw new Error("Export payload is missing thread metadata");
  }
  if (!Array.isArray(payload.messages)) {
    throw new Error("Export payload is missing messages");
  }
  return payload as ChatThreadExportPayload;
}
