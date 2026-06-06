"use client";

import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  clampChatColumnWidth,
  defaultChatColumnWidth,
  loadChatColumnWidth,
} from "@/lib/explorer-prefs";
import { useWorkspaceExplorerShell } from "@/lib/workspace-explorer";

/** Pin chat column width; side panel/header columns flex on resize. */
export function useAppMainSplit(
  measureRef: RefObject<HTMLElement | null>,
  panelOpen: boolean,
): CSSProperties | undefined {
  const { chatColumnWidth, setChatColumnWidth } = useWorkspaceExplorerShell();
  const chatColumnWidthRef = useRef(chatColumnWidth);
  chatColumnWidthRef.current = chatColumnWidth;

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || !panelOpen) return;

    const sync = (persistDefault: boolean) => {
      const containerWidth = el.getBoundingClientRect().width;
      if (containerWidth <= 0) return;

      const prev = chatColumnWidthRef.current;
      if (prev == null) {
        const stored = loadChatColumnWidth();
        const next =
          stored != null
            ? clampChatColumnWidth(stored, containerWidth)
            : defaultChatColumnWidth(containerWidth);
        setChatColumnWidth(next, containerWidth, persistDefault && stored == null);
        return;
      }

      const clamped = clampChatColumnWidth(prev, containerWidth);
      if (clamped !== prev) {
        setChatColumnWidth(clamped, containerWidth, false);
      }
    };

    sync(true);
    const observer = new ResizeObserver(() => sync(false));
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureRef, panelOpen, setChatColumnWidth]);

  if (!panelOpen || chatColumnWidth == null) return undefined;
  return {
    "--app-main-chat-width": `${chatColumnWidth}px`,
  } as CSSProperties;
}
