"use client";

import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  CHAT_MAIN_MIN_WIDTH,
  clampChatColumnWidth,
  defaultChatColumnWidth,
  loadChatColumnWidth,
} from "@/lib/explorer-prefs";
import { dispatchWorkspaceLayoutResize } from "@/lib/embedded-webview-bounds";
import { useWorkspaceExplorerShell } from "@/lib/workspace-explorer";

export const WORKSPACE_SINGLE_PANE_WIDTH = 760;
// Catalog (240), variable drawer (280), its inset (24), and panel padding/borders.
export const WORKSPACE_MIN_SPLIT_WIDTH = 560;

/** Keep the user's wide preference; constrain only the current presentation. */
export function useAppMainSplit(
  measureRef: RefObject<HTMLElement | null>,
  panelOpen: boolean,
): { style: CSSProperties | undefined; workspaceOnly: boolean } {
  const { chatColumnWidth, setChatColumnWidth } = useWorkspaceExplorerShell();
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || !panelOpen) return;

    const sync = () => {
      const width = el.getBoundingClientRect().width;
      if (width > 0) setContainerWidth(width);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [measureRef, panelOpen]);

  const workspaceOnly = panelOpen && containerWidth > 0 && (
    containerWidth < WORKSPACE_SINGLE_PANE_WIDTH
    || containerWidth < CHAT_MAIN_MIN_WIDTH + WORKSPACE_MIN_SPLIT_WIDTH
  );
  useLayoutEffect(() => {
    if (!panelOpen || !containerWidth || workspaceOnly || chatColumnWidth != null) return;
    const stored = loadChatColumnWidth();
    setChatColumnWidth(stored ?? defaultChatColumnWidth(containerWidth), containerWidth, stored == null);
  }, [panelOpen, containerWidth, workspaceOnly, chatColumnWidth, setChatColumnWidth]);

  const presentedChatWidth = Math.min(
    clampChatColumnWidth(chatColumnWidth ?? defaultChatColumnWidth(containerWidth), containerWidth),
    Math.max(CHAT_MAIN_MIN_WIDTH, containerWidth - WORKSPACE_MIN_SPLIT_WIDTH),
  );
  useLayoutEffect(() => {
    if (panelOpen && measureRef.current?.getBoundingClientRect().width) dispatchWorkspaceLayoutResize();
  }, [measureRef, panelOpen, workspaceOnly, containerWidth, presentedChatWidth]);
  return { workspaceOnly, style: !panelOpen || workspaceOnly || !containerWidth ? undefined : {
    "--app-main-chat-width": `${presentedChatWidth}px`,
  } as CSSProperties };
}
