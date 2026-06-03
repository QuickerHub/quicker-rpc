"use client";

import { resolveFileIconKind, type FileIconKind } from "@/lib/file-icon-kind";
import { getFileTypeIconSvg } from "@/lib/file-type-icon-svgs.generated";

/**
 * VS Code Icons (vscode-icons) — same family as Cursor file icons.
 * SVGs are vendored via scripts/build-file-type-icons.mjs (Iconify API).
 */
export function FileTypeIcon({ name }: { name: string }) {
  const kind = resolveFileIconKind(name);
  return (
    <span
      className={`explorer-tree-file-icon explorer-tree-svg--file-${kind}`}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: getFileTypeIconSvg(kind) }}
    />
  );
}

/** @deprecated Use FileTypeIcon — kept for existing imports. */
export const ExplorerFileIcon = FileTypeIcon;
