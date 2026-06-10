import { normalizeExplorerTreePath } from "@/lib/action-explorer-tree";

export type PreviewTabKind = "file" | "diff";

export function previewTabId(kind: PreviewTabKind, filePath: string): string {
  const normalized = normalizeExplorerTreePath(filePath);
  return `${kind}:${normalized}`;
}

export function parsePreviewTabId(
  tabId: string,
): { kind: PreviewTabKind; path: string } | null {
  const match = /^(file|diff):(.+)$/.exec(tabId);
  if (!match) return null;
  return {
    kind: match[1] as PreviewTabKind,
    path: match[2]!,
  };
}

/** @deprecated Use previewTabId('file', path) for new tabs. */
export const LEGACY_PREVIEW_TAB_ID = "__preview__";

export function isLegacyPreviewTabId(tabId: string): boolean {
  return tabId === LEGACY_PREVIEW_TAB_ID;
}
