"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ProgramStepTag } from "@/lib/program-step-tag";
import { createWorkspaceDocumentPresentation, type WorkspaceDocumentOwner } from "@/lib/workspace-document-instances";
import { useWorkspaceExplorerEditor, type ExplorerFileTab } from "@/lib/workspace-explorer";
import { WorkspaceExplorerEditorPane } from "./WorkspaceExplorerEditorPane";
import { ManualTracePresentationProvider } from "@/lib/action-trace-presentation";

export type WorkspaceDocumentChatPresentation = {
  threadId: string;
  pinStep: (tag: ProgramStepTag) => void;
};
type Outlet = { element: HTMLElement; owner: WorkspaceDocumentOwner; chat: WorkspaceDocumentChatPresentation };
type Host = { attach: (token: object, cwd: string, tab: ExplorerFileTab, element: HTMLElement, chat: WorkspaceDocumentChatPresentation) => () => void };
const WorkspaceDocumentHostContext = createContext<Host | null>(null);

/** One renderer for all Chats. The portal target is never replaced when its outlet moves. */
export function WorkspaceDocumentHost({ children }: { children: ReactNode }) {
  const { documentInstances, saveDocumentFile, saveDocumentProgram, refreshDocumentFile } = useWorkspaceExplorerEditor();
  const instances = useSyncExternalStore(documentInstances.subscribe, documentInstances.getSnapshot, documentInstances.getSnapshot);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const parkingRef = useRef<HTMLDivElement | null>(null);
  const [presentation] = useState(() => createWorkspaceDocumentPresentation<Outlet>());
  const [outlet, setOutlet] = useState<Outlet | null>(null);
  useLayoutEffect(() => {
    const node = document.createElement("div");
    node.className = "workspace-document-instances";
    Object.assign(node.style, { display: "flex", flexDirection: "column", height: "100%", minHeight: "0", minWidth: "0" });
    setContainer(node);
    return () => node.remove();
  }, []);
  const host = useMemo<Host>(() => ({
    attach(token, cwd, tab, element, chat) {
      const owner = documentInstances.visit(cwd, tab);
      const value = { owner, element, chat };
      presentation.register(token, value);
      setOutlet(value);
      return () => {
        presentation.release(token);
        if (!presentation.getCurrent()) setOutlet(null);
      };
    },
  }), [documentInstances, presentation]);
  useLayoutEffect(() => {
    if (!container) return;
    const destination = outlet?.element ?? parkingRef.current;
    destination?.appendChild(container);
    return () => { parkingRef.current?.appendChild(container); };
  }, [container, outlet]);

  const pinStep = useCallback((owner: WorkspaceDocumentOwner, tag: ProgramStepTag) => {
    const current = presentation.getCurrent();
    if (!current || current.value.owner !== owner || !documentInstances.isCurrent(owner)) return;
    current.value.chat.pinStep(tag);
  }, [documentInstances, presentation]);

  return <WorkspaceDocumentHostContext.Provider value={host}>
    {children}
    <div hidden inert ref={parkingRef} data-workspace-document-parking />
    {container && createPortal(instances.map(({ owner, tab }) => {
      const active = outlet?.owner === owner && documentInstances.isCurrent(owner);
      return <div key={owner.instanceId} hidden={!active} inert={!active} data-workspace-document={owner.key}
        style={active ? { display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, flex: "1 1 auto" } : undefined}>
        <ManualTracePresentationProvider threadId={outlet?.chat.threadId} cwd={owner.cwd} active={active}
          projectDirectory={/^(\.quicker\/actions\/[^/]+)\/(?:info|data)\.json$/i.exec(owner.path.replace(/\\/g, "/"))?.[1]}>
        <WorkspaceExplorerEditorPane active={active} showDoc={false} activeTab={tab} showEditorSkeleton={Boolean(tab.loading && !tab.content)} cwd={owner.cwd}
          onSaveWorkspaceFile={(path, content) => path === owner.path ? saveDocumentFile(owner, content) : Promise.resolve({ ok: false, error: "文件实例路径不匹配" })}
          onSaveDocument={(request) => saveDocumentProgram(owner, request)}
          onRefreshTree={() => { void refreshDocumentFile(owner); }} onActionProjectSynced={() => refreshDocumentFile(owner)}
          onPinStepToChat={(tag) => pinStep(owner, tag)} />
        </ManualTracePresentationProvider>
      </div>;
    }), container)}
  </WorkspaceDocumentHostContext.Provider>;
}

export function WorkspaceDocumentOutlet({ cwd, tab, chat }: { cwd: string; tab: ExplorerFileTab; chat: WorkspaceDocumentChatPresentation }) {
  const host = useContext(WorkspaceDocumentHostContext);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const token = useRef({});
  useLayoutEffect(() => {
    if (!host || !elementRef.current) return;
    return host.attach(token.current, cwd, tab, elementRef.current, chat);
  }, [host, cwd, tab, chat]);
  if (!host) throw new Error("WorkspaceDocumentOutlet requires the shared WorkspaceDocumentHost");
  return <div ref={elementRef} data-workspace-document-outlet style={{ height: "100%", minHeight: 0, minWidth: 0 }} />;
}
