"use client";

import { DesignerCatalogProvider } from "@/lib/action-editor/catalog/DesignerCatalogProvider";
import type { DesignerCatalogPort } from "@/lib/action-editor/catalog/designerCatalogPort";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import XProgramEditor from "@/lib/action-editor/program/XProgramEditor";
import {
  ActiveXProgramBridgeProvider,
  useActiveXProgramBridge,
} from "@/lib/action-editor/program/activeXProgramBridge";
import {
  type ActionProgramSnapshot,
} from "@/lib/action-editor/program/assembleActionProgramSnapshot";
import { fingerprintXProgramPresent, X_PROGRAM_HISTORY_ISOLATE_CLASS } from "@/lib/action-editor/program/xProgramHistory";
import type { ProgramDocumentEditorController } from "@/lib/action-editor/program/programDocumentEditorController";
import { ownsProgramKeyboardTarget } from "@/lib/action-editor/shared/programKeyboardOwner";
import { isKeyboardInputFocus, isKeyboardInputSurface } from "@/lib/action-editor/shared/keyboardInputSurface";
import { IconControl } from "@/lib/action-editor/shared/IconControl";
import { AD_ICONIFY_SPEC } from "@/lib/action-editor/shared/actionDesignerIconify";
import type { ActionSubProgram } from "@/lib/action-editor/types/common";
import type { ActionProjectWorkspaceContext } from "@/lib/action-editor/steps/paramEditors/FormDefEditorDialog";
import { ActionSubProgramKind } from "@/lib/action-editor/subprograms/subProgramUi";
import { mergeSubProgramsForStepEditor } from "@/lib/action-editor/subprograms/globalSubProgramCatalog";
import TreeActionToolbox from "@/lib/action-editor/toolbox/TreeActionToolbox";
import { createToolboxInsertionRegistry } from "@/lib/action-editor/toolbox/toolboxInsertionRegistry";
import "./program-editor-toolbox.css";

export type ProgramEditorWorkspaceHandle = {
  getSnapshot(): ActionProgramSnapshot;
  flushPendingEdits(): void;
};

export type ProgramEditorTabWorkspaceProps = {
  documentKey: string;
  controller: ProgramDocumentEditorController;
  active?: boolean;
  historyDisabled?: boolean;
  mainSurface?: "main" | "subProgram";
  workspaceContext?: ActionProjectWorkspaceContext;
  globalSubPrograms?: ActionSubProgram[];
  embeddedSubProgramsWireJson?: string;
  onHandleChange?: (handle: ProgramEditorWorkspaceHandle | null) => void;
  onPinStepToChat?: (stepId: string) => void;
  metadataPanel?: ReactNode;
  catalogPort?: DesignerCatalogPort;
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

/** Opened surfaces retain selection and drafts; their document owns the only present and history. */
export function ProgramEditorTabWorkspace(props: ProgramEditorTabWorkspaceProps): JSX.Element {
  const [activeTabId, setActiveTabId] = useState("main");
  const payload = props.controller.getSnapshot();
  const subProgramTabs = collectInternalTabs(payload.subPrograms).map((tab) => ({ id: tab.surface, row: tab.row }));
  const workspace = (
    <ActiveXProgramBridgeProvider activeTabId={activeTabId} subProgramTabs={subProgramTabs}>
      <ProgramEditorTabWorkspaceBody {...props} activeTabId={activeTabId} onSelectTab={setActiveTabId} />
    </ActiveXProgramBridgeProvider>
  );
  return props.catalogPort ? <DesignerCatalogProvider port={props.catalogPort}>{workspace}</DesignerCatalogProvider> : workspace;
}

function ProgramEditorTabWorkspaceBody({
  documentKey, controller, active = true, historyDisabled = false, mainSurface = "main", workspaceContext,
  globalSubPrograms = [], embeddedSubProgramsWireJson, onHandleChange,
  onPinStepToChat, metadataPanel, activeTabId, onSelectTab,
}: ProgramEditorTabWorkspaceProps & { activeTabId: string; onSelectTab: (id: string) => void }): JSX.Element {
  const bridge = useActiveXProgramBridge();
  const insertionRegistry = useRef(createToolboxInsertionRegistry());
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [visitedTabs, setVisitedTabs] = useState<string[]>([]);
  const payload = controller.getSnapshot();
  const workspaceRootRef = useRef<HTMLDivElement>(null);
  const keyboardOwnerId = useId();
  const available = useMemo(() => collectInternalTabs(payload.subPrograms), [payload.subPrograms]);
  const duplicateIds = available.some((tab) => !tab.row.id.trim())
    || new Set(available.map((tab) => tab.surface)).size !== available.length;
  const tabsById = useMemo(() => new Map(available.map((tab) => [tab.surface, tab])), [available]);
  const flushPendingEdits = useCallback(() => {
    for (const surface of ["main", ...available.map((tab) => tab.surface)]) {
      bridge.getEditorForSurface(surface)?.flushPendingEdits?.();
    }
  }, [available, bridge.getEditorForSurface]);
  const runHistory = useCallback((direction: "undo" | "redo") => {
    if (!active || historyDisabled) return;
    flushPendingEdits();
    controller[direction]();
  }, [active, historyDisabled, controller, flushPendingEdits]);
  useEffect(() => {
    const handle: ProgramEditorWorkspaceHandle = { getSnapshot: controller.getSnapshot, flushPendingEdits };
    onHandleChange?.(handle);
    return () => onHandleChange?.(null);
  }, [controller, onHandleChange, flushPendingEdits]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!active || historyDisabled || event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
      if (!ownsProgramKeyboardTarget(workspaceRootRef.current, keyboardOwnerId, event.target, document.activeElement)) return;
      const isolated = event.target instanceof Element && event.target.closest(`.${X_PROGRAM_HISTORY_ISOLATE_CLASS}`) != null;
      if (!isolated && (isKeyboardInputSurface(event.target) || isKeyboardInputFocus())) return;
      const key = event.key.toLowerCase();
      const direction = key === "z" && !event.shiftKey ? "undo" : key === "y" || (key === "z" && event.shiftKey) ? "redo" : null;
      if (!direction) return;
      event.preventDefault();
      runHistory(direction);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, historyDisabled, keyboardOwnerId, runHistory]);
  const history = controller.getHistoryState();
  const insertionHandlers = useMemo(() => new Map(["main", ...available.map((tab) => tab.surface)]
    .map((surface) => [surface, (handler: Parameters<typeof insertionRegistry.current.register>[1]) => insertionRegistry.current.register(surface, handler)])),
  [available]);
  const requestToolboxInsert = useCallback((payload: Parameters<typeof insertionRegistry.current.request>[1]) => {
    if (!active || activeTabId === "metadata") return Promise.resolve();
    return insertionRegistry.current.request(activeTabId, payload);
  }, [active, activeTabId]);
  const subPrograms = useMemo(
    () => mergeSubProgramsForStepEditor(payload.subPrograms, globalSubPrograms),
    [payload.subPrograms, globalSubPrograms],
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
  const metadataVisible = active && activeTabId === "metadata" && metadataPanel != null;
  const [metadataVisited, setMetadataVisited] = useState(false);
  useEffect(() => {
    if (activeTabId === "metadata") setMetadataVisited(true);
    if (activeTabId === "metadata" && metadataPanel == null) onSelectTab("main");
  }, [activeTabId, metadataPanel, onSelectTab]);
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
    <div ref={workspaceRootRef} className="program-editor-tab-workspace" data-program-workspace={documentKey} data-program-keyboard-owner={keyboardOwnerId}>
      <div className="x-program-editor-toolbar" role="toolbar" aria-label="文档历史">
        <button type="button" className="variable-toolbar-btn" title="撤销 (Ctrl+Z)" disabled={!active || historyDisabled || !history.canUndo} onClick={() => runHistory("undo")}>
          <IconControl spec={AD_ICONIFY_SPEC.undo} size={12} />
        </button>
        <button type="button" className="variable-toolbar-btn" title="重做 (Ctrl+Y / Ctrl+Shift+Z)" disabled={!active || historyDisabled || !history.canRedo} onClick={() => runHistory("redo")}>
          <IconControl spec={AD_ICONIFY_SPEC.redo} size={12} />
        </button>
        <span className="x-program-editor-toolbar-hint">主程序、子程序与属性共用撤销/重做历史</span>
      </div>
      <div className="program-editor-tab-strip" role="tablist" aria-label="程序文档" onKeyDown={handleTabKey}>
        <button type="button" role="tab" aria-selected={activeTabId === "main"}
          aria-controls={mainPanelId} onClick={() => onSelectTab("main")}>
          {mainSurface === "subProgram" ? "子程序" : "主程序"}
        </button>
        {metadataPanel != null ? <button type="button" role="tab" aria-selected={activeTabId === "metadata"}
          aria-controls={`${mainPanelId}-metadata`} onClick={() => { setMetadataVisited(true); onSelectTab("metadata"); }}>属性</button> : null}
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
      <div className="program-editor-catalog-layout">
      <aside className="program-editor-catalog" hidden={metadataVisible}>
        <div className="program-editor-catalog-heading">模块</div>
        <TreeActionToolbox active={active && activeTabId !== "metadata"} onInsertAtEnd={requestToolboxInsert} />
      </aside>
      <div className="program-editor-documents">
      {metadataVisited && metadataPanel != null ? <div id={`${mainPanelId}-metadata`} role="tabpanel" aria-label="属性"
        hidden={!metadataVisible} className="program-editor-metadata-surface">{metadataPanel}</div> : null}
      <div id={mainPanelId} role="tabpanel" aria-label={mainSurface === "subProgram" ? "子程序" : "主程序"}
        hidden={!mainVisible} className="program-editor-surface">
        <XProgramEditor initialPresent={payload} baselineFingerprint={fingerprintXProgramPresent(payload)}
          control={controller.getSurface("main")} keyboardOwnerId={keyboardOwnerId}
          editorTabId="main" active={mainVisible} programDocumentKey={documentKey} programSurface={mainSurface}
          workspaceContext={workspaceContext} subPrograms={subPrograms} embeddedSubProgramsWireJson={embeddedSubProgramsWireJson}
          onPinStepToChat={onPinStepToChat} registerToolboxInsert={insertionHandlers.get("main")} />
      </div>
      {visitedTabs.map((surface) => {
        const tab = tabsById.get(surface);
        if (!tab) return null;
        const visible = active && openTabs.includes(surface) && activeTabId === surface;
        return <div key={surface} id={`${mainPanelId}-${encodeURIComponent(surface)}`} role="tabpanel" aria-label={tab.row.name || tab.row.id}
          hidden={!visible} className="program-editor-surface">
          <XProgramEditor initialPresent={tab.row} baselineFingerprint={fingerprintXProgramPresent(tab.row)}
            control={controller.getSurface(surface)} keyboardOwnerId={keyboardOwnerId}
            editorTabId={surface} active={visible} programDocumentKey={`${documentKey}#${surface}`} programSurface="subProgram"
            workspaceContext={workspaceContext} subPrograms={subPrograms} embeddedSubProgramsWireJson={embeddedSubProgramsWireJson}
            registerToolboxInsert={insertionHandlers.get(surface)} />
        </div>;
      })}
      </div>
      </div>
    </div>
  );
}
