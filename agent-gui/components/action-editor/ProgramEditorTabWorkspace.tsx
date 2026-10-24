"use client";

import { DesignerCatalogProvider, useDesignerCatalogPort } from "@/lib/action-editor/catalog/DesignerCatalogProvider";
import type { DesignerCatalogPort } from "@/lib/action-editor/catalog/designerCatalogPort";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ProgramDocumentIdentity } from "@/lib/action-editor/document/programDocumentSession";
import { SubProgramPropertiesPopup } from "./SubProgramPropertiesPopup";
import { ProgramEditorModalContext } from "@/lib/action-editor/shared/ProgramEditorModalContext";
import { SubProgramDeleteDialog, type SubProgramDeleteLocation } from "./SubProgramDeleteDialog";
import type { PreparedSubProgramDelete } from "@/lib/action-editor/document/programDocumentSubPrograms";
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
import { EditorResourcePane } from "./EditorResourcePane";
import { createToolboxInsertionRegistry } from "@/lib/action-editor/toolbox/toolboxInsertionRegistry";
import "./program-editor-toolbox.css";

export type ProgramEditorWorkspaceHandle = {
  getSnapshot(): ActionProgramSnapshot;
  flushPendingEdits(): void;
  isLiveEditingBlocked(): boolean;
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
    if (row.kind !== ActionSubProgramKind.Internal && row.kind !== ActionSubProgramKind.Unspecified) return [];
    const label = parent ? `${parent} / ${row.name || row.id}` : row.name || row.id;
    const children = collectInternalTabs(row.subPrograms, label);
    return [{ surface: `sub-${row.id}`, row, label }, ...children];
  });
}

function deleteReferenceLocations(preview: PreparedSubProgramDelete, snapshot: ActionProgramSnapshot): SubProgramDeleteLocation[] {
  return preview.references.map(({ path, kind }) => {
    const parts = path.split("/").filter(Boolean);
    let rows = snapshot.subPrograms;
    let program = "主程序";
    const steps: string[] = [];
    for (let index = 0; index < parts.length; index += 2) {
      const key = parts[index], position = Number(parts[index + 1]);
      if (key === "subPrograms") {
        const row = rows[position];
        if (row) { program = row.name || row.id; rows = row.subPrograms; }
      } else if (key === "steps") steps.push(`第 ${position + 1} 步`);
      else if (key === "ifSteps" || key === "IfSteps") steps.push(`条件分支第 ${position + 1} 步`);
      else if (key === "elseSteps" || key === "ElseSteps") steps.push(`否则分支第 ${position + 1} 步`);
    }
    return { path, label: `${program} · ${steps.join(" / ")} · ${kind === "show_text" ? "文本操作" : "子程序调用"}` };
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
  const catalogPort = useDesignerCatalogPort();
  const insertionRegistry = useRef(createToolboxInsertionRegistry());
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [visitedTabs, setVisitedTabs] = useState<string[]>([]);
  const [propertiesTarget, setPropertiesTargetState] = useState<{ row: ActionSubProgram; identity: ProgramDocumentIdentity } | null>(null);
  const propertiesOwner = useRef<typeof propertiesTarget>(null);
  const setPropertiesTarget = useCallback((target: typeof propertiesTarget) => {
    propertiesOwner.current = target;
    setPropertiesTargetState(target);
  }, []);
  const [contextMenu, setContextMenu] = useState<{ surface: string; left: number; top: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ preview: PreparedSubProgramDelete; locations: SubProgramDeleteLocation[]; ticket: symbol; error?: string } | null>(null);
  const deleteOwner = useRef<{ ticket: symbol; controller: ProgramDocumentEditorController } | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string>();
  const live = useRef({ controller, active, historyDisabled });
  live.current = { controller, active, historyDisabled };
  const [appearancePickerOpen, setAppearancePickerOpenState] = useState(false);
  const appearancePickerOwner = useRef(false);
  const setAppearancePickerOpen = useCallback((open: boolean) => {
    appearancePickerOwner.current = open;
    setAppearancePickerOpenState(open);
  }, []);
  const modalOpen = Boolean(propertiesTarget || deleteTarget || appearancePickerOpen);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const payload = controller.getSnapshot();
  const workspaceRootRef = useRef<HTMLDivElement>(null);
  const keyboardOwnerId = useId();
  const resourceEpoch = useRef(0);
  const resourceCallOrigin = useMemo(() => ({ documentKey: activeTabId === "main" ? documentKey : `${documentKey}#${activeTabId}`,
    catalogKey: catalogPort?.key ?? "", ownerId: `${keyboardOwnerId}:${++resourceEpoch.current}` }),
  [documentKey, activeTabId, catalogPort, controller, active, modalOpen, keyboardOwnerId]);
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
    if (!active || historyDisabled || modalOpen) return;
    flushPendingEdits();
    controller[direction]();
  }, [active, historyDisabled, controller, flushPendingEdits, modalOpen]);
  useLayoutEffect(() => {
    const handle: ProgramEditorWorkspaceHandle = { getSnapshot: controller.getSnapshot, flushPendingEdits,
      isLiveEditingBlocked: () => Boolean(propertiesOwner.current || deleteOwner.current || appearancePickerOwner.current)
        || ["main", ...available.map((tab) => tab.surface)].some((surface) => bridge.getEditorForSurface(surface)?.isLiveEditingBlocked?.()),
    };
    onHandleChange?.(handle);
    return () => onHandleChange?.(null);
  }, [controller, onHandleChange, flushPendingEdits, available, bridge.getEditorForSurface]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!active || historyDisabled || modalOpen || event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
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
  }, [active, historyDisabled, keyboardOwnerId, runHistory, modalOpen]);
  const history = controller.getHistoryState();
  const insertionHandlers = useMemo(() => new Map(["main", ...available.map((tab) => tab.surface)]
    .map((surface) => [surface, (handler: Parameters<typeof insertionRegistry.current.register>[1]) => insertionRegistry.current.register(surface, handler)])),
  [available]);
  const requestToolboxInsert = useCallback((payload: Parameters<typeof insertionRegistry.current.request>[1]) => {
    if (!active || modalOpen || activeTabId === "metadata") return Promise.resolve();
    if (payload.resourceCall) flushPendingEdits();
    return insertionRegistry.current.request(activeTabId, payload);
  }, [active, activeTabId, modalOpen, flushPendingEdits]);
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
  const openProperties = (surface: string) => {
    if (!active || historyDisabled || deleteOwner.current) return;
    flushPendingEdits();
    const tab = collectInternalTabs(controller.getSnapshot().subPrograms).find((candidate) => candidate.surface === surface);
    if (!tab) return;
    onSelectTab(surface);
    setContextMenu(null);
    setPropertiesTarget({ row: tab.row, identity: controller.getIdentity() });
  };
  const closeProperties = () => {
    const element = workspaceRootRef.current;
    setPropertiesTarget(null);
    queueMicrotask(() => {
      if (active && element?.isConnected) element.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
    });
  };
  const openContextMenu = (surface: string, left: number, top: number) => {
    if (!active || historyDisabled || modalOpen) return;
    onSelectTab(surface);
    setContextMenu({ surface, left: Math.max(8, Math.min(left, window.innerWidth - 168)), top: Math.max(8, Math.min(top, window.innerHeight - 88)) });
  };
  useLayoutEffect(() => {
    deleteOwner.current = null;
    setDeleteTarget(null);
    setContextMenu(null);
    return () => { deleteOwner.current = null; };
  }, [controller, active]);
  const restoreTabFocus = () => queueMicrotask(() => {
    if (live.current.active && live.current.controller === controller) workspaceRootRef.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
  });
  const createSubProgram = () => {
    if (!live.current.active || live.current.historyDisabled || live.current.controller !== controller || modalOpen) return;
    const identity = controller.getIdentity();
    try {
      flushPendingEdits();
      const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const result = controller.createSubProgram({ id }, identity);
      if (!result.ok) { setLifecycleError(result.error); return; }
      setLifecycleError(undefined);
      openTab(`sub-${result.created.id}`);
      restoreTabFocus();
    } catch (error) { setLifecycleError(error instanceof Error ? error.message : String(error)); }
  };
  const prepareDelete = (surface: string) => {
    if (!active || historyDisabled || modalOpen || deleteOwner.current) return;
    setContextMenu(null);
    try {
      flushPendingEdits();
      const result = controller.prepareSubProgramDelete(surface.replace(/^sub-/, ""));
      if (!result.ok) { setLifecycleError(result.error); return; }
      const ticket = Symbol("subprogram-delete");
      deleteOwner.current = { ticket, controller };
      setLifecycleError(undefined);
      setDeleteTarget({ preview: result.preview, ticket, locations: deleteReferenceLocations(result.preview, controller.getSnapshot()) });
    } catch (error) { setLifecycleError(error instanceof Error ? error.message : String(error)); }
  };
  const cancelDelete = () => { deleteOwner.current = null; setDeleteTarget(null); restoreTabFocus(); };
  const confirmDelete = () => {
    if (!deleteTarget || deleteOwner.current?.ticket !== deleteTarget.ticket || !live.current.active || live.current.historyDisabled || live.current.controller !== controller) return;
    try {
      flushPendingEdits();
      if (deleteOwner.current?.ticket !== deleteTarget.ticket || live.current.controller !== controller || !live.current.active) return;
      const result = controller.deleteSubProgram(deleteTarget.preview);
      if (!result.ok) { setDeleteTarget((current) => current?.ticket === deleteTarget.ticket ? { ...current, error: `${result.error}。请取消后重新核对。` } : current); return; }
      const removed = new Set(deleteTarget.preview.removedIds.map((id) => `sub-${id}`));
      setOpenTabs((current) => current.filter((surface) => !removed.has(surface)));
      setVisitedTabs((current) => current.filter((surface) => !removed.has(surface)));
      if (removed.has(activeTabId)) onSelectTab("main");
      setLifecycleError(undefined);
      cancelDelete();
    } catch (error) { setDeleteTarget((current) => current?.ticket === deleteTarget.ticket ? { ...current, error: error instanceof Error ? error.message : String(error) } : current); }
  };
  useEffect(() => {
    if (!contextMenu || !active) return;
    contextMenuRef.current?.querySelector("button")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !contextMenuRef.current?.contains(event.target)) setContextMenu(null);
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [contextMenu, active]);
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
    <div ref={workspaceRootRef} className="program-editor-tab-workspace" data-program-workspace={documentKey} data-program-keyboard-owner={keyboardOwnerId} inert={modalOpen}>
      <div className="x-program-editor-toolbar" role="toolbar" aria-label="文档历史">
        <button type="button" className="variable-toolbar-btn" title="撤销 (Ctrl+Z)" disabled={!active || historyDisabled || modalOpen || !history.canUndo} onClick={() => runHistory("undo")}>
          <IconControl spec={AD_ICONIFY_SPEC.undo} size={12} />
        </button>
        <button type="button" className="variable-toolbar-btn" title="重做 (Ctrl+Y / Ctrl+Shift+Z)" disabled={!active || historyDisabled || modalOpen || !history.canRedo} onClick={() => runHistory("redo")}>
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
          return <span className="program-editor-tab" key={surface} onContextMenu={(event) => {
            event.preventDefault(); openContextMenu(surface, event.clientX, event.clientY);
          }}>
            <button type="button" role="tab" aria-selected={activeTabId === surface}
              aria-controls={`${mainPanelId}-${encodeURIComponent(surface)}`}
              title={tab.row.description || `${tab.label}（双击编辑属性）`} aria-haspopup="menu"
              aria-expanded={contextMenu?.surface === surface} onClick={() => onSelectTab(surface)}
              onDoubleClick={() => openProperties(surface)} onKeyDown={(event) => {
                if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); openContextMenu(surface, bounds.left, bounds.bottom);
              }}>{tab.row.name || tab.row.id}</button>
            <button type="button" className="program-editor-tab-close" aria-label={`关闭${tab.row.name || tab.row.id}标签`}
              onClick={() => closeTab(surface)}>×</button>
          </span>;
        })}
        {!duplicateIds ? <details className="program-editor-tab-add" ref={menuRef}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }}>
          <summary aria-label="打开或新建内部子程序" title="打开或新建内部子程序">＋</summary>
          <div className="program-editor-tab-menu">
            <button type="button" disabled={!active || historyDisabled || modalOpen} onClick={createSubProgram}>新建内部子程序</button>
            {available.length ? <div className="program-editor-tab-menu-heading">打开已有</div> : <div className="program-editor-tab-menu-heading">还没有内部子程序，可先新建</div>}
            {available.map((tab) => <button type="button" key={tab.surface}
              onClick={() => openTab(tab.surface)}>{tab.label}</button>)}
          </div>
        </details> : null}
      </div>
      {duplicateIds ? <p className="workspace-explorer-hint workspace-explorer-hint--err" role="alert">
        子程序标识缺失或重复，无法安全打开编辑标签。
      </p> : null}
      {lifecycleError ? <p className="workspace-explorer-hint workspace-explorer-hint--err" role="alert">{lifecycleError}</p> : null}
      <div className="program-editor-catalog-layout">
      <aside className="program-editor-catalog" hidden={metadataVisible}>
        <EditorResourcePane active={active && !modalOpen && activeTabId !== "metadata"} resourceCallOrigin={resourceCallOrigin}
          onInsertAtEnd={requestToolboxInsert} modules={(visible) =>
          <TreeActionToolbox active={visible} onInsertAtEnd={requestToolboxInsert} />} />
      </aside>
      <div className="program-editor-documents">
      {metadataVisited && metadataPanel != null ? <div id={`${mainPanelId}-metadata`} role="tabpanel" aria-label="属性"
        hidden={!metadataVisible} className="program-editor-metadata-surface"><ProgramEditorModalContext.Provider
          value={{ active: metadataVisible && !historyDisabled, keyboardOwnerId, setPickerOpen: setAppearancePickerOpen }}>
          {metadataPanel}</ProgramEditorModalContext.Provider></div> : null}
      <div id={mainPanelId} role="tabpanel" aria-label={mainSurface === "subProgram" ? "子程序" : "主程序"}
        hidden={!mainVisible} className="program-editor-surface">
        <XProgramEditor initialPresent={payload} baselineFingerprint={fingerprintXProgramPresent(payload)}
          control={controller.getSurface("main")} keyboardOwnerId={keyboardOwnerId}
          editorTabId="main" active={mainVisible && !modalOpen} programDocumentKey={documentKey} programSurface={mainSurface}
          workspaceContext={workspaceContext} subPrograms={subPrograms} embeddedSubProgramsWireJson={embeddedSubProgramsWireJson}
          onPinStepToChat={onPinStepToChat} registerToolboxInsert={insertionHandlers.get("main")} resourceCallOrigin={resourceCallOrigin} />
      </div>
      {visitedTabs.map((surface) => {
        const tab = tabsById.get(surface);
        if (!tab) return null;
        const visible = active && openTabs.includes(surface) && activeTabId === surface;
        return <div key={surface} id={`${mainPanelId}-${encodeURIComponent(surface)}`} role="tabpanel" aria-label={tab.row.name || tab.row.id}
          hidden={!visible} className="program-editor-surface">
          <XProgramEditor initialPresent={tab.row} baselineFingerprint={fingerprintXProgramPresent(tab.row)}
            control={controller.getSurface(surface)} keyboardOwnerId={keyboardOwnerId}
            editorTabId={surface} active={visible && !modalOpen} programDocumentKey={`${documentKey}#${surface}`} programSurface="subProgram"
            workspaceContext={workspaceContext} subPrograms={subPrograms} embeddedSubProgramsWireJson={embeddedSubProgramsWireJson}
            registerToolboxInsert={insertionHandlers.get(surface)} resourceCallOrigin={resourceCallOrigin} />
        </div>;
      })}
      </div>
      </div>
      {contextMenu && active ? createPortal(<div ref={contextMenuRef} className="program-editor-tab-context-menu" role="menu" aria-label="子程序标签菜单"
        data-program-keyboard-owner={keyboardOwnerId} style={{ left: contextMenu.left, top: contextMenu.top }} onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); setContextMenu(null); workspaceRootRef.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus(); }
        }}><button type="button" role="menuitem" onClick={() => openProperties(contextMenu.surface)}>属性…</button>
          <button type="button" role="menuitem" onClick={() => prepareDelete(contextMenu.surface)}>删除子程序…</button></div>, document.body) : null}
      {deleteTarget ? <SubProgramDeleteDialog preview={deleteTarget.preview} locations={deleteTarget.locations} active={active} disabled={historyDisabled}
        error={deleteTarget.error} keyboardOwnerId={keyboardOwnerId} onCancel={cancelDelete} onConfirm={confirmDelete} /> : null}
      {propertiesTarget ? <SubProgramPropertiesPopup active={active} disabled={historyDisabled} keyboardOwnerId={keyboardOwnerId}
        value={{ name: propertiesTarget.row.name, description: propertiesTarget.row.description, icon: propertiesTarget.row.icon }}
        reservedNames={available.filter((tab) => tab.row.id !== propertiesTarget.row.id).map((tab) => tab.row.name)}
        onClose={closeProperties} onApply={(patch) => {
          if (!active || historyDisabled) return { ok: false, error: "当前文档暂不可编辑" };
          flushPendingEdits();
          return controller.applySubProgramProperties(propertiesTarget.row.id, patch, { identity: propertiesTarget.identity,
            properties: { name: propertiesTarget.row.name, description: propertiesTarget.row.description, icon: propertiesTarget.row.icon } });
        }} /> : null}
    </div>
  );
}
