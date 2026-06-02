import type { AgentUIMessage } from "@/lib/chat-types";

export type ChatThread = {
  id: string;
  title: string;
  messages: AgentUIMessage[];
  updatedAt: number;
  /** LLM title applied; legacy threads with a derived title are treated as done. */
  titleGenerated?: boolean;
  /** User renamed in sidebar; skip auto title updates. */
  titleManual?: boolean;
};

export type ChatStoreData = {
  version: 2;
  activeThreadId: string;
  threads: ChatThread[];
  /** Thread ids shown in the titlebar tab strip (order preserved). */
  openTabIds: string[];
  /** User has explicitly opened/closed titlebar tabs since this field existed. */
  tabStripPersisted?: boolean;
  /** Empty = server default working directory (dev: repo root; release: Documents). */
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
    titleGenerated: false,
    titleManual: false,
  };
}

export function isThreadEmpty(thread: ChatThread): boolean {
  return thread.messages.length === 0;
}

/** Keep at most one empty thread; ensure the store is never thread-less. */
function compactEmptyThreads(data: ChatStoreData): ChatStoreData {
  if (data.threads.length === 0) {
    const thread = createThread();
    return {
      ...data,
      threads: [thread],
      activeThreadId: thread.id,
      openTabIds: [thread.id],
    };
  }

  const emptyThreads = data.threads.filter(isThreadEmpty);
  if (emptyThreads.length <= 1) {
    const openTabIds = data.openTabIds.filter((id) =>
      data.threads.some((t) => t.id === id),
    );
    return { ...data, openTabIds };
  }

  const active = data.threads.find((t) => t.id === data.activeThreadId);
  const keepEmptyId =
    active && isThreadEmpty(active)
      ? active.id
      : emptyThreads.sort((a, b) => b.updatedAt - a.updatedAt)[0]!.id;

  const threads = data.threads.filter(
    (t) => !isThreadEmpty(t) || t.id === keepEmptyId,
  );

  let activeThreadId = data.activeThreadId;
  if (!threads.some((t) => t.id === activeThreadId)) {
    activeThreadId = threads[0]!.id;
  }

  let openTabIds = data.openTabIds.filter((id) =>
    threads.some((t) => t.id === id),
  );
  if (openTabIds.length === 0) {
    openTabIds = [activeThreadId];
  }

  return { ...data, threads, activeThreadId, openTabIds };
}

export function defaultChatStore(): ChatStoreData {
  const thread = createThread();
  return {
    version: 2,
    activeThreadId: thread.id,
    threads: [thread],
    openTabIds: [thread.id],
    workingDirectory: "",
  };
}

function normalizeOpenTabIds(
  raw: unknown,
  threads: ChatThread[],
  activeThreadId: string,
  tabStripPersisted?: boolean,
): string[] {
  const threadIds = new Set(threads.map((t) => t.id));
  let openTabIds = Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === "string" && threadIds.has(id))
    : [];

  if (openTabIds.length === 0) {
    openTabIds = threadIds.has(activeThreadId)
      ? [activeThreadId]
      : [threads[0]!.id];
  }

  // Repair persisted state from older loads that expanded every thread into the tab strip.
  if (
    tabStripPersisted !== true
    && Array.isArray(raw)
    && threads.length > 1
    && openTabIds.length === threads.length
    && threads.every((t) => openTabIds.includes(t.id))
  ) {
    openTabIds = threadIds.has(activeThreadId)
      ? [activeThreadId]
      : [threads[0]!.id];
  }

  if (!openTabIds.includes(activeThreadId) && threadIds.has(activeThreadId)) {
    openTabIds = [...openTabIds, activeThreadId];
  }

  return openTabIds;
}

function tabStripStateChanged(
  before: Partial<ChatStoreData>,
  after: ChatStoreData,
): boolean {
  if (openTabIdsChanged(before.openTabIds, after.openTabIds)) return true;
  return before.tabStripPersisted !== after.tabStripPersisted;
}

function openTabIdsChanged(before: unknown, after: string[]): boolean {
  if (!Array.isArray(before)) return true;
  if (before.length !== after.length) return true;
  return before.some((id, index) => id !== after[index]);
}

function withTabStripPersisted(data: ChatStoreData): ChatStoreData {
  return data.tabStripPersisted === true
    ? data
    : { ...data, tabStripPersisted: true };
}

/** Titlebar tab strip cap; overflow tabs are hidden, not deleted (sidebar history kept). */
export const MAX_OPEN_CHAT_TABS = 8;

function threadById(threads: ChatThread[]): Map<string, ChatThread> {
  return new Map(threads.map((t) => [t.id, t]));
}

/** Drop inactive empty tabs when user focuses a conversation that has messages. */
function pruneAbandonedEmptyTabs(
  openTabIds: string[],
  threads: ChatThread[],
  activeThreadId: string,
): string[] {
  const byId = threadById(threads);
  const active = byId.get(activeThreadId);
  if (!active || isThreadEmpty(active)) return openTabIds;

  return openTabIds.filter((id) => {
    if (id === activeThreadId) return true;
    const thread = byId.get(id);
    return !thread || !isThreadEmpty(thread);
  });
}

/**
 * Enforce tab cap: close inactive tabs from the strip (left-to-right among empties,
 * then least-recently-updated among the rest). Never hides the active tab.
 */
function pruneOpenTabIds(
  openTabIds: string[],
  threads: ChatThread[],
  activeThreadId: string,
  maxTabs: number = MAX_OPEN_CHAT_TABS,
): string[] {
  if (openTabIds.length <= maxTabs) return openTabIds;

  const byId = threadById(threads);
  let ids = [...openTabIds];

  while (ids.length > maxTabs) {
    const inactive = ids.filter((id) => id !== activeThreadId);
    if (inactive.length === 0) break;

    const emptyInactive = inactive.filter((id) => {
      const t = byId.get(id);
      return t !== undefined && isThreadEmpty(t);
    });

    let victimId: string;
    if (emptyInactive.length > 0) {
      victimId = emptyInactive[0]!;
    } else {
      victimId = inactive.reduce((oldest, id) => {
        const t = byId.get(id);
        const o = byId.get(oldest);
        if (!t) return oldest;
        if (!o) return id;
        return t.updatedAt < o.updatedAt ? id : oldest;
      }, inactive[0]!);
    }

    ids = ids.filter((id) => id !== victimId);
  }

  return ids;
}

function applyOpenTabPolicy(
  data: ChatStoreData,
  options?: { pruneAbandonedEmpty?: boolean },
): ChatStoreData {
  let openTabIds = data.openTabIds;
  if (options?.pruneAbandonedEmpty) {
    openTabIds = pruneAbandonedEmptyTabs(
      openTabIds,
      data.threads,
      data.activeThreadId,
    );
  }
  openTabIds = pruneOpenTabIds(
    openTabIds,
    data.threads,
    data.activeThreadId,
  );
  if (
    openTabIds.length === data.openTabIds.length
    && openTabIds.every((id, i) => id === data.openTabIds[i])
  ) {
    return data;
  }
  return { ...data, openTabIds };
}

function normalizeThreads(raw: unknown): ChatThread[] {
  const threads: ChatThread[] = [];
  if (!Array.isArray(raw)) return threads;

  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const t = item as Partial<ChatThread>;
    if (typeof t.id !== "string" || typeof t.title !== "string") continue;
    const messages = Array.isArray(t.messages)
      ? (t.messages as AgentUIMessage[])
      : [];
    const titleGenerated =
      t.titleGenerated === true
      || (t.titleGenerated !== false
        && messages.length > 0
        && t.title !== "新对话");
    threads.push({
      id: t.id,
      title: t.title,
      messages,
      updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : now(),
      titleGenerated,
      titleManual: t.titleManual === true,
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

    const tabStripPersisted = data.tabStripPersisted === true;
    const openTabIds = normalizeOpenTabIds(
      data.openTabIds,
      threads,
      activeThreadId,
      tabStripPersisted,
    );

    return compactEmptyThreads({
      version: 2,
      activeThreadId,
      threads,
      openTabIds,
      tabStripPersisted,
      workingDirectory:
        typeof data.workingDirectory === "string" ? data.workingDirectory : "",
    });
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

  return compactEmptyThreads({
    version: 2,
    activeThreadId,
    threads,
    openTabIds: normalizeOpenTabIds(undefined, threads, activeThreadId),
    workingDirectory:
      typeof activeWorkspace?.rootPath === "string" ? activeWorkspace.rootPath : "",
  });
}

export function loadChatStore(): ChatStoreData {
  if (typeof window === "undefined") return defaultChatStore();

  try {
    const current = localStorage.getItem(CHAT_STORAGE_KEY);
    if (current) {
      const raw = JSON.parse(current) as Partial<ChatStoreData>;
      const store = normalizeStore(raw);
      if (tabStripStateChanged(raw, store)) {
        saveChatStore(store);
      }
      return store;
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

export function getOpenTabThreads(data: ChatStoreData): ChatThread[] {
  const byId = new Map(data.threads.map((t) => [t.id, t]));
  return data.openTabIds
    .map((id) => byId.get(id))
    .filter((t): t is ChatThread => t !== undefined);
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
  const hadContent =
    (data.threads.find((t) => t.id === threadId)?.messages.length ?? 0) > 0;
  const next: ChatStoreData = {
    ...data,
    threads: data.threads.map((thread) => {
      if (thread.id !== threadId) return thread;
      if (threadMessagesEqual(thread.messages, messages)) {
        return thread;
      }
      const ts = now();
      const shouldSetProvisionalTitle =
        messages.length > 0
        && !thread.titleManual
        && !thread.titleGenerated;
      return {
        ...thread,
        messages,
        title: shouldSetProvisionalTitle
          ? deriveThreadTitle(messages)
          : thread.title,
        updatedAt: ts,
      };
    }),
  };
  if (!hadContent && messages.length > 0 && threadId === next.activeThreadId) {
    return applyOpenTabPolicy(next, { pruneAbandonedEmpty: true });
  }
  return next;
}

export function addThread(data: ChatStoreData): ChatStoreData {
  const existingEmpty = data.threads.find(isThreadEmpty);
  if (existingEmpty) {
    const openTabIds = data.openTabIds.includes(existingEmpty.id)
      ? data.openTabIds
      : [...data.openTabIds, existingEmpty.id];
    return withTabStripPersisted(
      applyOpenTabPolicy(
        compactEmptyThreads({
          ...data,
          openTabIds,
          activeThreadId: existingEmpty.id,
        }),
      ),
    );
  }

  const thread = createThread();
  const activeIndex = data.threads.findIndex((t) => t.id === data.activeThreadId);
  const insertAt = activeIndex >= 0 ? activeIndex + 1 : data.threads.length;
  const threads = [...data.threads];
  threads.splice(insertAt, 0, thread);

  const tabIndex = data.openTabIds.indexOf(data.activeThreadId);
  const openTabIds = [...data.openTabIds];
  openTabIds.splice(
    tabIndex >= 0 ? tabIndex + 1 : openTabIds.length,
    0,
    thread.id,
  );

  return withTabStripPersisted(
    applyOpenTabPolicy(
      compactEmptyThreads({
        ...data,
        activeThreadId: thread.id,
        threads,
        openTabIds,
      }),
    ),
  );
}

export function selectThread(data: ChatStoreData, threadId: string): ChatStoreData {
  if (!data.threads.some((t) => t.id === threadId)) return data;
  return applyOpenTabPolicy(
    { ...data, activeThreadId: threadId },
    { pruneAbandonedEmpty: true },
  );
}

/** Open a thread in the tab strip (sidebar) and focus it. */
export function openThread(data: ChatStoreData, threadId: string): ChatStoreData {
  if (!data.threads.some((t) => t.id === threadId)) return data;
  const openTabIds = data.openTabIds.includes(threadId)
    ? data.openTabIds
    : [...data.openTabIds, threadId];
  return withTabStripPersisted(
    applyOpenTabPolicy(
      { ...data, openTabIds, activeThreadId: threadId },
      { pruneAbandonedEmpty: true },
    ),
  );
}

/** Hide a tab without deleting the conversation (sidebar history kept). */
export function closeTab(data: ChatStoreData, threadId: string): ChatStoreData {
  if (!data.openTabIds.includes(threadId)) return data;

  const tabIndex = data.openTabIds.indexOf(threadId);
  const openTabIds = data.openTabIds.filter((id) => id !== threadId);
  let { activeThreadId, threads } = data;

  if (activeThreadId === threadId) {
    if (openTabIds.length > 0) {
      activeThreadId = openTabIds[Math.min(tabIndex, openTabIds.length - 1)]!;
    } else {
      const existingEmpty = threads.find(isThreadEmpty);
      if (existingEmpty) {
        activeThreadId = existingEmpty.id;
        openTabIds.push(existingEmpty.id);
      } else {
        const thread = createThread();
        threads = [...threads, thread];
        activeThreadId = thread.id;
        openTabIds.push(thread.id);
      }
    }
  }

  return withTabStripPersisted({ ...data, threads, openTabIds, activeThreadId });
}

export function deleteThread(data: ChatStoreData, threadId: string): ChatStoreData {
  const index = data.threads.findIndex((t) => t.id === threadId);
  if (index < 0) return data;

  let threads = data.threads.filter((t) => t.id !== threadId);
  let openTabIds = data.openTabIds.filter((id) => id !== threadId);
  let activeThreadId = data.activeThreadId;

  if (data.activeThreadId === threadId) {
    if (openTabIds.length > 0) {
      const closedTabIndex = data.openTabIds.indexOf(threadId);
      activeThreadId = openTabIds[
        Math.min(closedTabIndex, openTabIds.length - 1)
      ]!;
    } else if (threads.length > 0) {
      activeThreadId = threads[Math.min(index, threads.length - 1)]!.id;
    } else {
      const thread = createThread();
      threads = [thread];
      activeThreadId = thread.id;
      openTabIds = [thread.id];
    }
  }

  if (openTabIds.length === 0 && threads.length > 0) {
    const existingEmpty = threads.find(isThreadEmpty);
    if (existingEmpty) {
      activeThreadId = existingEmpty.id;
      openTabIds = [existingEmpty.id];
    } else {
      const thread = createThread();
      threads = [...threads, thread];
      activeThreadId = thread.id;
      openTabIds = [thread.id];
    }
  }

  return compactEmptyThreads({ ...data, threads, openTabIds, activeThreadId });
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
      thread.id === threadId
        ? { ...thread, title: trimmed, titleManual: true, titleGenerated: true }
        : thread,
    ),
  };
}

export function updateThreadTitle(
  data: ChatStoreData,
  threadId: string,
  title: string,
): ChatStoreData {
  const trimmed = title.trim();
  if (!trimmed) return data;
  return {
    ...data,
    threads: data.threads.map((thread) => {
      if (thread.id !== threadId) return thread;
      if (thread.titleManual) return thread;
      if (thread.titleGenerated && thread.title === trimmed) return thread;
      return {
        ...thread,
        title: trimmed,
        titleGenerated: true,
        updatedAt: now(),
      };
    }),
  };
}

export function setWorkingDirectory(
  data: ChatStoreData,
  workingDirectory: string,
): ChatStoreData {
  return { ...data, workingDirectory: workingDirectory.trim() };
}
