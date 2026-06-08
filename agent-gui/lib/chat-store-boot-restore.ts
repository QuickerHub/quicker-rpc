import type { ChatStoreData } from "@/lib/chat-store";
import {
  chatStoreHasPersistedMessages,
  tryRestoreLegacyChatStore,
} from "@/lib/chat-store";
import { fetchLegacyChatStoreCandidatesFromDisk } from "@/lib/legacy-chat-restore-client";

const AUTO_RESTORE_SESSION_KEY = "agent-gui-auto-restore-attempted";

function autoRestoreAlreadyAttempted(): boolean {
  try {
    return sessionStorage.getItem(AUTO_RESTORE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markAutoRestoreAttempted(): void {
  try {
    sessionStorage.setItem(AUTO_RESTORE_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

function restoreChanged(result: {
  ok: boolean;
  importedThreadCount: number;
  updatedThreadCount: number;
}): boolean {
  return (
    result.ok
    && (result.importedThreadCount > 0 || result.updatedThreadCount > 0)
  );
}

/**
 * When the current origin has no persisted messages, try once per session to merge
 * legacy chat data from localStorage (backup / v1 / v2) and known LevelDB profiles.
 */
export async function maybeAutoRestoreChatStoreOnBoot(
  current: ChatStoreData,
): Promise<ChatStoreData | null> {
  if (typeof window === "undefined") return null;
  if (autoRestoreAlreadyAttempted()) return null;
  if (chatStoreHasPersistedMessages(current)) return null;

  markAutoRestoreAttempted();

  const local = tryRestoreLegacyChatStore(current);
  if (restoreChanged(local.result)) {
    return local.next;
  }

  const disk = await fetchLegacyChatStoreCandidatesFromDisk();
  if (disk.candidates.length === 0) return null;

  const merged = tryRestoreLegacyChatStore(local.next, disk.candidates, {
    scannedRoots: disk.scannedRoots,
  });
  if (!restoreChanged(merged.result)) return null;

  return merged.next;
}

/** @internal test helper */
export function resetAutoRestoreAttemptedForTests(): void {
  try {
    sessionStorage.removeItem(AUTO_RESTORE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
