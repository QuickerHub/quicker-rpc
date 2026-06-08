import type { AgentUIMessage } from "@/lib/chat-types";
import {
  chatStoreHasPersistedMessages,
  compactEmptyThreads,
  defaultChatStore,
  parseLegacyChatPayload,
} from "@/lib/chat-store";
import type { ChatStoreData, ChatThread } from "@/lib/chat-store";
import {
  assembleStoreFromV3Parts,
  CHAT_STORAGE_BACKUP_KEY,
  CHAT_STORAGE_KEY,
  CHAT_THREAD_BACKUP_KEY_PREFIX,
  CHAT_THREAD_KEY_PREFIX,
  isThreadBackupStorageKey,
  isThreadStorageKey,
  parseThreadMessagesFromLegacyJson,
  tryParseV3Index,
  type ChatStoreIndex,
} from "@/lib/chat-store-persist";
import { LEGACY_WORKSPACE_STORAGE_KEY } from "@/lib/legacy-chat-scan-markers";

export type LegacyScanHit = {
  source: string;
  storageKey: string;
  json: string;
};

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function threadIdFromStorageKey(key: string): string | null {
  if (key.startsWith(CHAT_THREAD_BACKUP_KEY_PREFIX)) {
    const id = key.slice(CHAT_THREAD_BACKUP_KEY_PREFIX.length).trim();
    return id || null;
  }
  if (key.startsWith(CHAT_THREAD_KEY_PREFIX)) {
    const id = key.slice(CHAT_THREAD_KEY_PREFIX.length).trim();
    return id || null;
  }
  return null;
}

function isWorkspaceStorageKey(key: string): boolean {
  return key === LEGACY_WORKSPACE_STORAGE_KEY || key.includes("workspaces");
}

function isBackupIndexStorageKey(key: string): boolean {
  return key === CHAT_STORAGE_BACKUP_KEY
    || (key.includes("agent-gui-chats-backup") && !key.includes("thread"));
}

function isPrimaryIndexStorageKey(key: string): boolean {
  if (isWorkspaceStorageKey(key) || isBackupIndexStorageKey(key)) return false;
  if (isThreadStorageKey(key) || isThreadBackupStorageKey(key)) return false;
  return key === CHAT_STORAGE_KEY
    || (key.includes("agent-gui-chats") && !key.includes("thread"));
}

function collectUsedThreadIds(stores: ChatStoreData[]): Set<string> {
  const used = new Set<string>();
  for (const store of stores) {
    for (const thread of store.threads) {
      if (thread.messages.length > 0) used.add(thread.id);
    }
  }
  return used;
}

function buildOrphanThreadStore(
  primaryMessages: Map<string, AgentUIMessage[]>,
  backupMessages: Map<string, AgentUIMessage[]>,
  usedThreadIds: Set<string>,
): ChatStoreData | null {
  const orphans: ChatThread[] = [];

  for (const [threadId, messages] of primaryMessages) {
    if (usedThreadIds.has(threadId) || messages.length === 0) continue;
    orphans.push({
      id: threadId,
      title: "恢复的对话",
      messages,
      updatedAt: Date.now(),
      titleGenerated: false,
      titleManual: false,
    });
  }

  for (const [threadId, messages] of backupMessages) {
    if (usedThreadIds.has(threadId) || messages.length === 0) continue;
    if (orphans.some((thread) => thread.id === threadId)) continue;
    orphans.push({
      id: threadId,
      title: "恢复的对话（备份）",
      messages,
      updatedAt: Date.now(),
      titleGenerated: false,
      titleManual: false,
    });
  }

  if (orphans.length === 0) return null;

  const activeThreadId = orphans[0]!.id;
  return compactEmptyThreads({
    ...defaultChatStore(),
    activeThreadId,
    openTabIds: [activeThreadId],
    threads: orphans,
  });
}

/**
 * Combine LevelDB / scan hits into full chat stores (v2 monolith, v1 workspaces,
 * v3 index + per-thread blobs, orphan thread shards).
 */
export function assembleChatStoreCandidatesFromLegacyHits(
  hits: LegacyScanHit[],
): Array<{ source: string; data: ChatStoreData }> {
  const monolithic: Array<{ source: string; data: ChatStoreData }> = [];
  const v3Indexes: Array<{ source: string; index: ChatStoreIndex }> = [];
  const primaryMessages = new Map<string, AgentUIMessage[]>();
  const backupMessages = new Map<string, AgentUIMessage[]>();

  for (const hit of hits) {
    const { source, storageKey, json } = hit;

    if (isThreadStorageKey(storageKey) || storageKey.includes("agent-gui-chats-thread-")) {
      const threadId = threadIdFromStorageKey(storageKey);
      const messages = parseThreadMessagesFromLegacyJson(json, threadId ?? undefined);
      if (messages.length === 0) continue;
      const resolvedId = threadId
        ?? (parseJson(json) as { threadId?: string } | null)?.threadId;
      if (!resolvedId) continue;
      primaryMessages.set(resolvedId, messages);
      continue;
    }

    if (isThreadBackupStorageKey(storageKey) || storageKey.includes("backup-thread-")) {
      const threadId = threadIdFromStorageKey(storageKey);
      const messages = parseThreadMessagesFromLegacyJson(json, threadId ?? undefined);
      if (messages.length === 0) continue;
      const resolvedId = threadId
        ?? (parseJson(json) as { threadId?: string } | null)?.threadId;
      if (!resolvedId) continue;
      backupMessages.set(resolvedId, messages);
      continue;
    }

    const monolithicStore = parseLegacyChatPayload(storageKey, json);
    if (monolithicStore) {
      monolithic.push({ source, data: monolithicStore });
      continue;
    }

    const parsed = parseJson(json);
    if (!parsed) continue;

    if (isBackupIndexStorageKey(storageKey)) {
      const index = tryParseV3Index(parsed);
      if (index) v3Indexes.push({ source: `${source}（备份索引）`, index });
      continue;
    }

    if (isPrimaryIndexStorageKey(storageKey)) {
      const index = tryParseV3Index(parsed);
      if (index) v3Indexes.push({ source, index });
    }
  }

  const assembled: Array<{ source: string; data: ChatStoreData }> = [...monolithic];

  for (const { source, index } of v3Indexes) {
    const store = assembleStoreFromV3Parts(index, (threadId) => {
      const primary = primaryMessages.get(threadId);
      if (primary && primary.length > 0) return primary;
      return backupMessages.get(threadId) ?? [];
    });
    if (chatStoreHasPersistedMessages(store)) {
      assembled.push({ source, data: store });
    }
  }

  const orphanStore = buildOrphanThreadStore(
    primaryMessages,
    backupMessages,
    collectUsedThreadIds(assembled.map((item) => item.data)),
  );
  if (orphanStore) {
    assembled.push({ source: "孤立线程分片", data: orphanStore });
  }

  return assembled;
}
