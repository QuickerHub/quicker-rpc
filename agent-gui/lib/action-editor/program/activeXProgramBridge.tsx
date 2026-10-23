"use client";

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import type { XProgramEditorHandle } from "./xProgramEditorHandle";

export type ActiveBridgeSubProgramTabSpec = {
  id: string;
  row: { name: string; description?: string };
};

export type ActiveXProgramBridge = {
  activeTabId: string;
  subProgramTabs: readonly ActiveBridgeSubProgramTabSpec[];
  registerEditor: (surface: string, editor: XProgramEditorHandle) => void;
  unregisterEditor: (surface: string, editor?: XProgramEditorHandle) => void;
  getEditorForSurface: (surface: string) => XProgramEditorHandle | null;
  getActiveEditor: () => XProgramEditorHandle | null;
  getActiveTargetLabel: () => string;
};

const ActiveXProgramBridgeContext = createContext<ActiveXProgramBridge | null>(null);
const EMPTY_SUBPROGRAM_TABS: readonly ActiveBridgeSubProgramTabSpec[] = [];

/** A document workspace owns its registry; independent documents never share editors. */
export function ActiveXProgramBridgeProvider({
  activeTabId = "main",
  subProgramTabs = EMPTY_SUBPROGRAM_TABS,
  children,
}: {
  activeTabId?: string;
  subProgramTabs?: readonly ActiveBridgeSubProgramTabSpec[];
  children: ReactNode;
}) {
  const editors = useRef(new Map<string, XProgramEditorHandle>());
  const registerEditor = useCallback((surface: string, editor: XProgramEditorHandle): void => {
    editors.current.set(surface.trim() || "main", editor);
  }, []);
  const unregisterEditor = useCallback((surface: string, editor?: XProgramEditorHandle): void => {
    const key = surface.trim() || "main";
    if (editor == null || editors.current.get(key) === editor) editors.current.delete(key);
  }, []);
  const getEditorForSurface = useCallback((surface: string): XProgramEditorHandle | null => (
    editors.current.get(surface.trim() || "main") ?? null
  ), []);
  const getActiveEditor = useCallback(() => getEditorForSurface(activeTabId), [activeTabId, getEditorForSurface]);
  const getActiveTargetLabel = useCallback(() => (
    activeTabId === "metadata" ? "属性" : activeTabId === "main"
      ? "主程序"
      : subProgramTabs.find((tab) => tab.id === activeTabId)?.row.name?.trim() || "子程序"
  ), [activeTabId, subProgramTabs]);
  const value = useMemo<ActiveXProgramBridge>(() => ({
    activeTabId, subProgramTabs, registerEditor, unregisterEditor,
    getEditorForSurface, getActiveEditor, getActiveTargetLabel,
  }), [activeTabId, subProgramTabs, registerEditor, unregisterEditor, getEditorForSurface, getActiveEditor, getActiveTargetLabel]);
  return <ActiveXProgramBridgeContext.Provider value={value}>{children}</ActiveXProgramBridgeContext.Provider>;
}

export function useActiveXProgramBridgeOptional(): ActiveXProgramBridge | null {
  return useContext(ActiveXProgramBridgeContext);
}

export function useActiveXProgramBridge(): ActiveXProgramBridge {
  const bridge = useActiveXProgramBridgeOptional();
  if (!bridge) throw new Error("useActiveXProgramBridge requires ActiveXProgramBridgeProvider");
  return bridge;
}
