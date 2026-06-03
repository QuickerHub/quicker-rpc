"use client";

import { memo } from "react";
import { DocsViewerPanel } from "@/components/chat/DocsViewerTabs";
import { FileEditorCard } from "@/components/chat/FileEditorCard";
import { ActionProjectInfoEditor } from "@/components/workspace/ActionProjectInfoEditor";
import { isActionProjectInfoPath } from "@/lib/action-project-info-parse";
import type { ExplorerFileTab } from "@/lib/workspace-explorer";
type WorkspaceExplorerEditorPaneProps = {
  showDoc: boolean;
  activeTab: ExplorerFileTab | null;
  showEditorSkeleton: boolean;
  cwd: string;
  onSaveWorkspaceFile: (
    path: string,
    content: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onRefreshTree: () => void;
  onActionProjectSynced: () => void;
};

export const WorkspaceExplorerEditorPane = memo(function WorkspaceExplorerEditorPane({
  showDoc,
  activeTab,
  showEditorSkeleton,
  cwd,
  onSaveWorkspaceFile,
  onRefreshTree,
  onActionProjectSynced,
}: WorkspaceExplorerEditorPaneProps) {
  if (showDoc) {
    return <DocsViewerPanel />;
  }

  if (!activeTab) {
    return <p className="workspace-explorer-hint">选择文档或文件以预览</p>;
  }

  if (activeTab.error) {
    return (
      <p className="workspace-explorer-hint workspace-explorer-hint--err">
        {activeTab.error}
      </p>
    );
  }

  return (
    <div
      className={`workspace-explorer-editor-inner${
        showEditorSkeleton ? " workspace-explorer-editor-inner--loading" : ""
      }`}
    >
      {showEditorSkeleton ? (
        <div
          className="workspace-explorer-editor-skeleton"
          aria-busy="true"
          aria-label="加载中"
        />
      ) : null}

      {activeTab.content ? (
        isActionProjectInfoPath(activeTab.path) ? (
          <>
            <ActionProjectInfoEditor
              path={activeTab.path}
              content={activeTab.content}
              cwd={cwd}
              onSave={(nextContent) => onSaveWorkspaceFile(activeTab.path, nextContent)}
              onSaved={onRefreshTree}
              onSynced={onActionProjectSynced}
            />
            {activeTab.truncated ? (
              <p className="file-editor-footnote file-editor-footnote--warn">
                内容已截断
                {activeTab.totalChars !== undefined
                  ? ` · 文件共 ${activeTab.totalChars} 字符`
                  : ""}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <FileEditorCard
              path={activeTab.path}
              content={activeTab.content}
              showHeader={false}
            />
            {activeTab.truncated ? (
              <p className="file-editor-footnote file-editor-footnote--warn">
                内容已截断
                {activeTab.totalChars !== undefined
                  ? ` · 文件共 ${activeTab.totalChars} 字符`
                  : ""}
              </p>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
});
