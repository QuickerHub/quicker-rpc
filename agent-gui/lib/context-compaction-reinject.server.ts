import "server-only";

import type { AgentUIMessage } from "@/lib/chat-types";
import {
  collectRecentPatchPaths,
  renderPostCompactReinjectBlock,
  type PostCompactReinjectResult,
} from "@/lib/context-compaction-reinject";
import { readWorkspaceFileSnapshot } from "@/lib/workspace-fs";

const MAX_REINJECT_FILES = 4;
const MAX_REINJECT_CHARS_PER_FILE = 1800;
const MAX_REINJECT_TOTAL_CHARS = 6000;

/** Read recent patched files and build a system suffix reinject block. */
export async function buildPostCompactReinjectBlock(
  recentMessages: AgentUIMessage[],
): Promise<PostCompactReinjectResult> {
  const paths = collectRecentPatchPaths(recentMessages, {
    maxRounds: 4,
    maxPaths: MAX_REINJECT_FILES,
  });
  if (paths.length === 0) {
    return { block: null, paths: [] };
  }

  const entries: Array<{ path: string; content: string; truncated: boolean }> = [];
  let totalChars = 0;

  for (const path of paths) {
    const remaining = MAX_REINJECT_TOTAL_CHARS - totalChars;
    if (remaining <= 0) break;
    const perFileLimit = Math.min(MAX_REINJECT_CHARS_PER_FILE, remaining);
    const snapshot = await readWorkspaceFileSnapshot(path, perFileLimit);
    if (!snapshot.ok) continue;
    entries.push({
      path,
      content: snapshot.content,
      truncated: snapshot.truncated,
    });
    totalChars += snapshot.content.length;
  }

  return {
    block: renderPostCompactReinjectBlock(entries),
    paths: entries.map((entry) => entry.path),
  };
}
