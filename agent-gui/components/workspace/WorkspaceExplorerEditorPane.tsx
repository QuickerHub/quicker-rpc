"use client";

import { memo } from "react";
import { CodeMirrorPreview } from "@/components/chat/CodeMirrorPreview";
import { DocsViewerPanel } from "@/components/chat/DocsViewerTabs";
import { FileEditorCard } from "@/components/chat/FileEditorCard";
import { ActionProjectInfoEditor } from "@/components/workspace/ActionProjectInfoEditor";
import { ActionProjectDataEditor } from "@/components/action-editor/ActionProjectDataEditor";
import { isActionProjectDataPath } from "@/lib/action-project-data-parse";
import { isActionProjectInfoPath } from "@/lib/action-project-info-parse";
import type { ExplorerFileTab } from "@/lib/workspace-explorer";
import { formatWorkspaceFetchError } from "@/lib/workspace-explorer-api";
type WorkspaceExplorerEditorPaneProps = {
  showDoc: boolean;
  activeTab: ExplorerFileTab | null;
  selectedIsDirectory?: boolean;
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
  selectedIsDirectory = false,
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
    return (
      <p className="workspace-explorer-hint">
        {selectedIsDirectory ? "已选择文件夹，请点击其中的文件以预览" : "选择文档或文件以预览"}
      </p>
    );
  }

  if (activeTab.error) {
    return (
      <p className="workspace-explorer-hint workspace-explorer-hint--err">
        {formatWorkspaceFetchError(new Error(activeTab.error))}
      </p>
    );
  }

  if (activeTab.kind === "diff") {
    return (
      <div className="workspace-explorer-editor-inner workspace-explorer-editor-inner--diff">
        {showEditorSkeleton || activeTab.loading ? (
          <div
            className="workspace-explorer-editor-skeleton"
            aria-busy="true"
            aria-label="加载 Diff"
          />
        ) : (
          <CodeMirrorPreview
            path={activeTab.path}
            content={activeTab.diff ?? ""}
            language="diff"
            fillAvailable
            lineNumbers
          />
        )}
      </div>
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
        ) : isActionProjectDataPath(activeTab.path) ? (
          <>
            <ActionProjectDataEditor
              path={activeTab.path}
              content={activeTab.content}
              truncated={activeTab.truncated}
              totalChars={activeTab.totalChars}
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
              fillAvailable
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
