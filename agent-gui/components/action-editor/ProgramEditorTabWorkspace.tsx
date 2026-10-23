"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type JSX } from "react";
import XProgramEditor from "@/lib/action-editor/program/XProgramEditor";
import {
  ActiveXProgramBridgeProvider,
  useActiveXProgramBridge,
} from "@/lib/action-editor/program/activeXProgramBridge";
import {
  assembleActionProgramSnapshot,
  type ActionProgramSnapshot,
} from "@/lib/action-editor/program/assembleActionProgramSnapshot";
import { fingerprintXProgramPresent, type XProgramPresent } from "@/lib/action-editor/program/xProgramHistory";
import type { ActionSubProgram } from "@/lib/action-editor/types/common";
import type { ActionProjectWorkspaceContext } from "@/lib/action-editor/steps/paramEditors/FormDefEditorDialog";
import { ActionSubProgramKind } from "@/lib/action-editor/subprograms/subProgramUi";
import { mergeSubProgramsForStepEditor } from "@/lib/action-editor/subprograms/globalSubProgramCatalog";

export type ProgramEditorWorkspaceHandle = {
  getSnapshot(): ActionProgramSnapshot;
};

export type ProgramEditorTabWorkspaceProps = {
  documentKey: string;
  payload: ActionProgramSnapshot;
  active?: boolean;
  mainSurface?: "main" | "subProgram";
  workspaceContext?: ActionProjectWorkspaceContext;
  globalSubPrograms?: ActionSubProgram[];
  embeddedSubProgramsWireJson?: string;
  onSnapshotChange?: (snapshot: ActionProgramSnapshot) => void;
  onHandleChange?: (handle: ProgramEditorWorkspaceHandle | null) => void;
  onPinStepToChat?: (stepId: string) => void;
};

type ProgramTab = { surface: string; row: ActionSubProgram; label: string };

function collectInternalTabs(rows: readonly ActionSubProgram[], parent = ""): ProgramTab[] {
  return rows.flatMap((row) => {
    const label = parent ? `${parent} / ${row.name || row.id}` : row.name || row.id;
    const children = collectInternalTabs(row.subPrograms, label);
    if (row.kind !== ActionSubProgramKind.Internal && row.kind !== ActionSubProgramKind.Unspecified) return children;
    return [{ surface: `sub-${row.id}`, row, label }, ...children];
  });
}

/** Adapted from Quicker.Headless's ProgramEditorTabWorkspace: retain each opened surface and its history. */
export function ProgramEditorTabWorkspace(props: ProgramEditorTabWorkspaceProps): JSX.Element {
  const [activeTabId, setActiveTabId] = useState("main");
  const subProgramTabs = useMemo(() => collectInternalTabs(props.payload.subPrograms)
    .map((tab) => ({ id: tab.surface, row: tab.row })), [props.payload.subPrograms]);
  return (
    <ActiveXProgramBridgeProvider activeTabId={activeTabId} subProgramTabs={subProgramTabs}>
      <ProgramEditorTabWorkspaceBody {...props} activeTabId={activeTabId} onSelectTab={setActiveTabId} />
    </ActiveXProgramBridgeProvider>
  );
}

function ProgramEditorTabWorkspaceBody({
  documentKey, payload, active = true, mainSurface = "main", workspaceContext,
  globalSubPrograms = [], embeddedSubProgramsWireJson, onSnapshotChange, onHandleChange,
  onPinStepToChat, activeTabId, onSelectTab,
}: ProgramEditorTabWorkspaceProps & { activeTabId: string; onSelectTab: (id: string) => void }): JSX.Element {
  const bridge = useActiveXProgramBridge();
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [visitedTabs, setVisitedTabs] = useState<string[]>([]);
  const [liveSnapshot, setLiveSnapshot] = useState(payload);
  const overrides = useRef<Record<string, XProgramPresent>>({});
  const initialPayload = useRef(payload);
  const changeListener = useRef(onSnapshotChange);
  changeListener.current = onSnapshotChange;
  const available = useMemo(() => collectInternalTabs(payload.subPrograms), [payload.subPrograms]);
  const duplicateIds = available.some((tab) => !tab.row.id.trim())
    || new Set(available.map((tab) => tab.surface)).size !== available.length;
  const tabsById = useMemo(() => new Map(available.map((tab) => [tab.surface, tab])), [available]);
  const readSnapshot = useCallback(() => assembleActionProgramSnapshot({
    payload: initialPayload.current,
    getEditorForSurface: bridge.getEditorForSurface,
    liveOverrides: overrides.current,
  }), [bridge.getEditorForSurface]);
  useEffect(() => {
    const handle: ProgramEditorWorkspaceHandle = { getSnapshot: readSnapshot };
    onHandleChange?.(handle);
    return () => onHandleChange?.(null);
  }, [onHandleChange, readSnapshot]);

  const handlePresentChange = useCallback((surface: string, present: XProgramPresent) => {
    if (surface !== "main") overrides.current[surface.replace(/^sub-/, "")] = present;
    const snapshot = readSnapshot();
    setLiveSnapshot(snapshot);
    changeListener.current?.(snapshot);
  }, [readSnapshot]);
  const changeHandlers = useMemo(() => new Map(["main", ...available.map((tab) => tab.surface)]
    .map((surface) => [surface, (present: XProgramPresent) => handlePresentChange(surface, present)])),
  [available, handlePresentChange]);
  const subPrograms = useMemo(
    () => mergeSubProgramsForStepEditor(liveSnapshot.subPrograms, globalSubPrograms),
    [liveSnapshot.subPrograms, globalSubPrograms],
  );
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const openTab = (surface: string) => {
    setOpenTabs((current) => current.includes(surface) ? current : [...current, surface]);
    setVisitedTabs((current) => current.includes(surface) ? current : [...current, surface]);
    onSelectTab(surface);
    if (menuRef.current) menuRef.current.open = false;
  };
  const closeTab = (surface: string) => {
    setOpenTabs((current) => current.filter((id) => id !== surface));
    if (activeTabId === surface) onSelectTab("main");
  };
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target) && menuRef.current) menuRef.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, []);

  const mainVisible = active && activeTabId === "main";
  const mainPanelId = useId();
  const handleTabKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement) || event.target.getAttribute("role") !== "tab") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % buttons.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[next]?.focus();
    buttons[next]?.click();
  };
  return (
    <div className="program-editor-tab-workspace" data-program-workspace={documentKey}>
      <div className="program-editor-tab-strip" role="tablist" aria-label="程序文档" onKeyDown={handleTabKey}>
        <button type="button" role="tab" aria-selected={activeTabId === "main"}
          aria-controls={mainPanelId} onClick={() => onSelectTab("main")}>
          {mainSurface === "subProgram" ? "子程序" : "主程序"}
        </button>
        {openTabs.map((surface) => {
          const tab = tabsById.get(surface);
          if (!tab) return null;
          return <span className="program-editor-tab" key={surface}>
            <button type="button" role="tab" aria-selected={activeTabId === surface}
              aria-controls={`${mainPanelId}-${encodeURIComponent(surface)}`}
              title={tab.label} onClick={() => onSelectTab(surface)}>{tab.row.name || tab.row.id}</button>
            <button type="button" className="program-editor-tab-close" aria-label={`关闭${tab.row.name || tab.row.id}标签`}
              onClick={() => closeTab(surface)}>×</button>
          </span>;
        })}
        {available.length > 0 && !duplicateIds ? <details className="program-editor-tab-add" ref={menuRef}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }}>
          <summary aria-label="打开嵌入子程序" title="打开嵌入子程序">＋</summary>
          <div className="program-editor-tab-menu">
            {available.map((tab) => <button type="button" key={tab.surface}
              onClick={() => openTab(tab.surface)}>{tab.label}</button>)}
          </div>
        </details> : null}
      </div>
      {duplicateIds ? <p className="workspace-explorer-hint workspace-explorer-hint--err" role="alert">
        子程序标识缺失或重复，无法安全打开编辑标签。
      </p> : null}
      <div id={mainPanelId} role="tabpanel" aria-label={mainSurface === "subProgram" ? "子程序" : "主程序"}
        hidden={!mainVisible} className="program-editor-surface">
        <XProgramEditor initialPresent={initialPayload.current} baselineFingerprint={fingerprintXProgramPresent(initialPayload.current)}
          editorTabId="main" active={mainVisible} programDocumentKey={documentKey} programSurface={mainSurface}
          workspaceContext={workspaceContext} subPrograms={subPrograms} embeddedSubProgramsWireJson={embeddedSubProgramsWireJson}
          onPresentChange={changeHandlers.get("main")} onPinStepToChat={onPinStepToChat} />
      </div>
      {visitedTabs.map((surface) => {
        const tab = tabsById.get(surface);
        if (!tab) return null;
        const visible = active && openTabs.includes(surface) && activeTabId === surface;
        return <div key={surface} id={`${mainPanelId}-${encodeURIComponent(surface)}`} role="tabpanel" aria-label={tab.row.name || tab.row.id}
          hidden={!visible} className="program-editor-surface">
          <XProgramEditor initialPresent={tab.row} baselineFingerprint={fingerprintXProgramPresent(tab.row)}
            editorTabId={surface} active={visible} programDocumentKey={`${documentKey}#${surface}`} programSurface="subProgram"
            workspaceContext={workspaceContext} subPrograms={subPrograms} embeddedSubProgramsWireJson={embeddedSubProgramsWireJson}
            onPresentChange={changeHandlers.get(surface)} />
        </div>;
      })}
    </div>
  );
}
