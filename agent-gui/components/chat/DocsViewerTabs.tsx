"use client";

import { useDocsViewer } from "@/lib/docs-viewer";
import { useDelayedTrue } from "@/lib/use-delayed-true";

import { MarkdownMessage } from "./MarkdownMessage";

export function DocsViewerPanel() {
  const { activeDoc } = useDocsViewer();
  const showSkeleton = useDelayedTrue(
    Boolean(activeDoc?.loading && !activeDoc?.markdown),
  );

  if (!activeDoc) return null;

  if (showSkeleton) {
    return (
      <div
        className="workspace-explorer-editor-skeleton"
        aria-busy="true"
        aria-label="加载文档"
      />
    );
  }

  if (activeDoc.error) {
    return (
      <p className="workspace-explorer-hint workspace-explorer-hint--err">
        {activeDoc.error}
      </p>
    );
  }

  if (!activeDoc.markdown) return null;

  return (
    <div className="workspace-explorer-docs-body" aria-label={activeDoc.title}>
      <MarkdownMessage content={activeDoc.markdown} variant="assistant" />
    </div>
  );
}
