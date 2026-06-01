import type { AgentUIMessage } from "@/lib/chat-types";

export type ChatThread = {
  id: string;
  title: string;
  messages: AgentUIMessage[];
  updatedAt: number;
};

export type ChatStoreData = {
  version: 2;
  activeThreadId: string;
  threads: ChatThread[];
  /** Empty = server default repo root (qkrpc cwd). */
  workingDirectory: string;
};

export const CHAT_STORAGE_KEY = "agent-gui-chats";
const LEGACY_WORKSPACE_STORAGE_KEY = "agent-gui-workspaces";

function now(): number {
  return Date.now();
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function deriveThreadTitle(messages: AgentUIMessage[]): string {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      if (part.type === "text" && part.text.trim()) {
        const text = part.text.trim().replace(/\s+/g, " ");
        return text.length > 36 ? `${text.slice(0, 36)}…` : text;
      }
    }
  }
  return "新对话";
}

function createThread(): ChatThread {
  const ts = now();
  return {
    id: createId(),
    title: "新对话",
    messages: [],
    updatedAt: ts,
  };
}

export function defaultChatStore(): ChatStoreData {
  const thread = createThread();
  return {
    version: 2,
    activeThreadId: thread.id,
    threads: [thread],
    workingDirectory: "",
  };
}

function normalizeThreads(raw: unknown): ChatThread[] {
  const threads: ChatThread[] = [];
  if (!Array.isArray(raw)) return threads;

  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const t = item as Partial<ChatThread>;
    if (typeof t.id !== "string" || typeof t.title !== "string") continue;
    threads.push({
      id: t.id,
      title: t.title,
      messages: Array.isArray(t.messages) ? (t.messages as AgentUIMessage[]) : [],
      updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : now(),
    });
  }
  return threads;
}

function normalizeStore(raw: unknown): ChatStoreData {
  if (typeof raw !== "object" || raw === null) {
    return defaultChatStore();
  }

  const data = raw as Partial<ChatStoreData>;
  if (data.version === 2 && Array.isArray(data.threads) && data.threads.length > 0) {
    const threads = normalizeThreads(data.threads);
    if (threads.length === 0) return defaultChatStore();

    const activeThreadId =
      typeof data.activeThreadId === "string"
      && threads.some((t) => t.id === data.activeThreadId)
        ? data.activeThreadId
        : threads[0]!.id;

    return {
      version: 2,
      activeThreadId,
      threads,
      workingDirectory:
        typeof data.workingDirectory === "string" ? data.workingDirectory : "",
    };
  }

  return defaultChatStore();
}

/** Migrate legacy multi-workspace localStorage (v1). */
function migrateLegacyWorkspaceStore(raw: unknown): ChatStoreData | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as {
    version?: number;
    activeWorkspaceId?: string;
    activeThreadId?: string;
    workspaces?: Array<{
      id?: string;
      rootPath?: string;
      threads?: unknown;
    }>;
  };

  if (data.version !== 1 || !Array.isArray(data.workspaces) || data.workspaces.length === 0) {
    return null;
  }

  const activeWorkspace =
    data.workspaces.find((w) => w.id === data.activeWorkspaceId) ?? data.workspaces[0];

  const threadMap = new Map<string, ChatThread>();
  for (const ws of data.workspaces) {
    for (const thread of normalizeThreads(ws?.threads)) {
      const existing = threadMap.get(thread.id);
      if (!existing || thread.updatedAt > existing.updatedAt) {
        threadMap.set(thread.id, thread);
      }
    }
  }

  const threads = [...threadMap.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  if (threads.length === 0) return null;

  const activeThreadId =
    typeof data.activeThreadId === "string"
    && threads.some((t) => t.id === data.activeThreadId)
      ? data.activeThreadId
      : threads[0]!.id;

  return {
    version: 2,
    activeThreadId,
    threads,
    workingDirectory:
      typeof activeWorkspace?.rootPath === "string" ? activeWorkspace.rootPath : "",
  };
}

export function loadChatStore(): ChatStoreData {
  if (typeof window === "undefined") return defaultChatStore();

  try {
    const current = localStorage.getItem(CHAT_STORAGE_KEY);
    if (current) {
      return normalizeStore(JSON.parse(current) as unknown);
    }

    const legacy = localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY);
    if (legacy) {
      const migrated = migrateLegacyWorkspaceStore(JSON.parse(legacy) as unknown);
      if (migrated) {
        saveChatStore(migrated);
        return migrated;
      }
    }
  } catch {
    /* fall through */
  }

  return defaultChatStore();
}

export function saveChatStore(data: ChatStoreData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

export function getActiveThread(data: ChatStoreData): ChatThread {
  return data.threads.find((t) => t.id === data.activeThreadId) ?? data.threads[0]!;
}

export function sortThreads(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort((a, b) => {
    const byTime = b.updatedAt - a.updatedAt;
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
}

/** True when persisted message snapshots are equivalent (ignore select/reopen). */
export function threadMessagesEqual(
  a: AgentUIMessage[],
  b: AgentUIMessage[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function updateThreadMessages(
  data: ChatStoreData,
  threadId: string,
  messages: AgentUIMessage[],
): ChatStoreData {
  return {
    ...data,
    threads: data.threads.map((thread) => {
      if (thread.id !== threadId) return thread;
      if (threadMessagesEqual(thread.messages, messages)) {
        return thread;
      }
      const ts = now();
      const title = deriveThreadTitle(messages);
      return {
        ...thread,
        messages,
        title: messages.length > 0 ? title : thread.title,
        updatedAt: ts,
      };
    }),
  };
}

export function addThread(data: ChatStoreData): ChatStoreData {
  const thread = createThread();
  return {
    ...data,
    activeThreadId: thread.id,
    threads: [thread, ...data.threads],
  };
}

export function selectThread(data: ChatStoreData, threadId: string): ChatStoreData {
  if (!data.threads.some((t) => t.id === threadId)) return data;
  return { ...data, activeThreadId: threadId };
}

export function deleteThread(data: ChatStoreData, threadId: string): ChatStoreData {
  if (data.threads.length <= 1) return data;
  const threads = data.threads.filter((t) => t.id !== threadId);
  const activeThreadId =
    data.activeThreadId === threadId ? threads[0]!.id : data.activeThreadId;
  return { ...data, threads, activeThreadId };
}

export function renameThread(
  data: ChatStoreData,
  threadId: string,
  title: string,
): ChatStoreData {
  const trimmed = title.trim();
  if (!trimmed) return data;
  return {
    ...data,
    threads: data.threads.map((thread) =>
      thread.id === threadId ? { ...thread, title: trimmed } : thread,
    ),
  };
}

export function setWorkingDirectory(
  data: ChatStoreData,
  workingDirectory: string,
): ChatStoreData {
  return { ...data, workingDirectory: workingDirectory.trim() };
}
