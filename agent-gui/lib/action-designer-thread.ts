import type { ActionDesignerEmbedParams } from "@/lib/action-designer-embed";
import {
  addThread,
  sortThreads,
  type ChatStoreData,
  type ChatThread,
} from "@/lib/chat-store";

/** Persisted link between a chat thread and an ActionDesigner window (action / subprogram). */
export type ActionDesignerThreadRef = {
  entityId: string;
  isSubProgram: boolean;
};

export function actionDesignerRefFromEmbed(
  embed: Pick<ActionDesignerEmbedParams, "scoped" | "entityId" | "isSubProgram">,
): ActionDesignerThreadRef | undefined {
  if (!embed.scoped) return undefined;
  const entityId = embed.entityId.trim();
  if (!entityId) return undefined;
  return { entityId, isSubProgram: embed.isSubProgram };
}

export function actionDesignerThreadKey(ref: ActionDesignerThreadRef): string {
  return `${ref.entityId.trim().toLowerCase()}\0${ref.isSubProgram ? "1" : "0"}`;
}

export function threadMatchesActionDesigner(
  thread: Pick<ChatThread, "actionDesigner">,
  ref: ActionDesignerThreadRef,
): boolean {
  const tag = thread.actionDesigner;
  if (!tag?.entityId?.trim()) return false;
  return (
    tag.entityId.trim().toLowerCase() === ref.entityId.trim().toLowerCase()
    && tag.isSubProgram === ref.isSubProgram
  );
}

export function threadsForActionDesigner(
  threads: ChatThread[],
  ref: ActionDesignerThreadRef,
): ChatThread[] {
  return threads.filter((thread) => threadMatchesActionDesigner(thread, ref));
}

export function threadHasActionDesignerTag(
  thread: Pick<ChatThread, "actionDesigner">,
): boolean {
  return !!thread.actionDesigner?.entityId?.trim();
}

export function actionDesignerGroupLabel(ref: ActionDesignerThreadRef): string {
  const id = ref.entityId.trim();
  const short = id.length > 14 ? `…${id.slice(-12)}` : id;
  const kind = ref.isSubProgram ? "子程序" : "动作";
  return `${short} · ${kind}`;
}

export type ActionDesignerThreadGroup = {
  key: string;
  ref: ActionDesignerThreadRef;
  label: string;
  threads: ChatThread[];
  latestUpdatedAt: number;
};

/** Group designer-tagged threads for debug sidebar (by entity + subprogram flag). */
export function groupThreadsByActionDesigner(
  threads: ChatThread[],
): ActionDesignerThreadGroup[] {
  const tagged = threads.filter(threadHasActionDesignerTag);
  const map = new Map<string, ChatThread[]>();

  for (const thread of tagged) {
    const ref = thread.actionDesigner!;
    const key = actionDesignerThreadKey(ref);
    const list = map.get(key) ?? [];
    list.push(thread);
    map.set(key, list);
  }

  const groups: ActionDesignerThreadGroup[] = [];
  for (const [key, groupThreads] of map) {
    const sorted = sortThreads(groupThreads);
    const ref = sorted[0]!.actionDesigner!;
    groups.push({
      key,
      ref,
      label: actionDesignerGroupLabel(ref),
      threads: sorted,
      latestUpdatedAt: sorted[0]?.updatedAt ?? 0,
    });
  }

  groups.sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt);
  return groups;
}

/**
 * When ActionDesigner embed loads, scope the tab strip to this designer's threads
 * and activate the most recently updated one (or create a fresh thread).
 */
export function focusActionDesignerInStore(
  data: ChatStoreData,
  ref: ActionDesignerThreadRef,
): ChatStoreData {
  let scoped = data;
  const active = scoped.threads.find((thread) => thread.id === scoped.activeThreadId);
  if (
    active
    && !active.actionDesigner?.entityId?.trim()
    && scoped.openTabIds.includes(active.id)
  ) {
    const threads = scoped.threads.map((thread) =>
      thread.id === active.id ? { ...thread, actionDesigner: ref } : thread,
    );
    scoped = { ...scoped, threads };
  }

  let designerThreads = threadsForActionDesigner(scoped.threads, ref);
  if (designerThreads.length === 0) {
    const activeAfterTag = scoped.threads.find(
      (thread) => thread.id === scoped.activeThreadId,
    );
    if (activeAfterTag && !activeAfterTag.actionDesigner?.entityId?.trim()) {
      const threads = scoped.threads.map((thread) =>
        thread.id === activeAfterTag.id
          ? { ...thread, actionDesigner: ref }
          : thread,
      );
      scoped = { ...scoped, threads };
      designerThreads = threadsForActionDesigner(threads, ref);
    }
  }
  if (designerThreads.length === 0) {
    return addThread(scoped, { actionDesigner: ref });
  }

  const designerIds = new Set(designerThreads.map((thread) => thread.id));
  let openTabIds = scoped.openTabIds.filter((id) => designerIds.has(id));
  if (openTabIds.length === 0) {
    openTabIds = sortThreads(designerThreads).map((thread) => thread.id);
  }

  const recent = sortThreads(designerThreads)[0]!;
  const activeThreadId = designerIds.has(scoped.activeThreadId)
    ? scoped.activeThreadId
    : recent.id;

  if (
    openTabIds.length === scoped.openTabIds.length
    && openTabIds.every((id, index) => id === scoped.openTabIds[index])
    && activeThreadId === scoped.activeThreadId
    && scoped === data
  ) {
    return scoped;
  }

  return { ...scoped, openTabIds, activeThreadId };
}
