"use client";

import { memo } from "react";
import { CodeMirrorPreview } from "@/components/chat/CodeMirrorPreview";
import { DocsViewerPanel } from "@/components/chat/DocsViewerTabs";
import { FileEditorCard } from "@/components/chat/FileEditorCard";
import { ActionProjectInfoEditor } from "@/components/workspace/ActionProjectInfoEditor";
import { saveProgramDocumentClient } from "@/lib/program-document-save-client";
import { ActionProjectDataEditor } from "@/components/action-editor/ActionProjectDataEditor";
import { isActionProjectDataPath } from "@/lib/action-project-data-parse";
import { isActionProjectInfoPath } from "@/lib/action-project-info-parse";
import type { ExplorerFileTab } from "@/lib/workspace-explorer";
import { fetchWorkspaceFile, formatWorkspaceFetchError } from "@/lib/workspace-explorer-api";
import { invalidateWorkspaceFileReadCache } from "@/lib/workspace-file-read-cache";
import type { ProgramStepTag } from "@/lib/program-step-tag";
import type { ProgramDocumentSaveRequest, ProgramDocumentSaveResult } from "@/lib/program-document-save";
type WorkspaceExplorerEditorPaneProps = {
  active?: boolean;
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
  onActionProjectSynced: () => void | Promise<void>;
  onPinStepToChat?: (tag: ProgramStepTag) => void;
  onSaveDocument?: (request: ProgramDocumentSaveRequest) => Promise<ProgramDocumentSaveResult>;
};

export const WorkspaceExplorerEditorPane = memo(function WorkspaceExplorerEditorPane({
  active = true,
  showDoc,
  activeTab,
  selectedIsDirectory = false,
  showEditorSkeleton,
  cwd,
  onSaveWorkspaceFile,
  onRefreshTree,
  onActionProjectSynced,
  onPinStepToChat,
  onSaveDocument,
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

  if (activeTab.error && !activeTab.content) {
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

  const actionDataEditor = isActionProjectDataPath(activeTab.path);

  return (
    <div
      className={`workspace-explorer-editor-inner${
        showEditorSkeleton ? " workspace-explorer-editor-inner--loading" : ""
      }${actionDataEditor ? " workspace-explorer-editor-inner--action-data" : ""}`}
    >
      {showEditorSkeleton ? (
        <div
          className="workspace-explorer-editor-skeleton"
          aria-busy="true"
          aria-label="加载中"
        />
      ) : null}

      {activeTab.content || actionDataEditor || isActionProjectInfoPath(activeTab.path) ? (
        isActionProjectInfoPath(activeTab.path) ? (
          <>
            <ActionProjectInfoEditor
              active={active}
              path={activeTab.path}
              content={activeTab.content}
              cwd={cwd}
              onSave={async (nextContent) => {
                const infoPath = activeTab.path.replace(/\\/g, "/");
                if (!/^\.quicker\/actions\/[^/]+\/info\.json$/i.test(infoPath)) return onSaveWorkspaceFile(activeTab.path, nextContent);
                const dataPath = infoPath.replace(/info\.json$/i, "data.json");
                invalidateWorkspaceFileReadCache(cwd, dataPath);
                const body = await fetchWorkspaceFile(cwd, dataPath);
                if (!body.ok) return body;
                if (body.truncated) return { ok: false, error: "动作正文未完整加载，无法保存属性" };
                const request = { path: dataPath, content: body.content, expectedContent: body.content,
                  metadata: { content: nextContent, expectedContent: activeTab.content ?? "" },
                };
                return onSaveDocument ? onSaveDocument(request) : saveProgramDocumentClient(cwd, request);
              }}
              onSaved={onActionProjectSynced}
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
              active={active}
              onPinStepToChat={onPinStepToChat}
              path={activeTab.path}
              content={activeTab.content}
              truncated={activeTab.truncated}
              totalChars={activeTab.totalChars}
              cwd={cwd}
              onSave={(nextContent) => onSaveWorkspaceFile(activeTab.path, nextContent)}
              onSaveDocument={onSaveDocument ?? ((request) => saveProgramDocumentClient(cwd, request))}
              onSaved={onActionProjectSynced}
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
