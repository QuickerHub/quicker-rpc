"use client";

import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  adaptChatColumnWidthForContainer,
  clampChatColumnWidth,
  defaultChatColumnWidth,
  loadChatColumnWidth,
} from "@/lib/explorer-prefs";
import { dispatchWorkspaceLayoutResize } from "@/lib/embedded-webview-bounds";
import { useWorkspaceExplorerShell } from "@/lib/workspace-explorer";

/** Pin chat column width; adapt proportionally on shrink, cap growth on expand. */
export function useAppMainSplit(
  measureRef: RefObject<HTMLElement | null>,
  panelOpen: boolean,
): CSSProperties | undefined {
  const { chatColumnWidth, setChatColumnWidth } = useWorkspaceExplorerShell();
  const chatColumnWidthRef = useRef(chatColumnWidth);
  chatColumnWidthRef.current = chatColumnWidth;
  const containerWidthRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || !panelOpen) return;

    const sync = (persistDefault: boolean) => {
      const containerWidth = el.getBoundingClientRect().width;
      if (containerWidth <= 0) return;

      const prevContainer = containerWidthRef.current;
      const prevChat = chatColumnWidthRef.current;

      if (prevChat == null) {
        const stored = loadChatColumnWidth();
        const next =
          stored != null
            ? clampChatColumnWidth(stored, containerWidth)
            : defaultChatColumnWidth(containerWidth);
        containerWidthRef.current = containerWidth;
        setChatColumnWidth(next, containerWidth, persistDefault && stored == null);
        dispatchWorkspaceLayoutResize();
        return;
      }

      let nextChat = prevChat;
      if (prevContainer != null && prevContainer > 0 && prevContainer !== containerWidth) {
        nextChat = adaptChatColumnWidthForContainer(
          prevChat,
          prevContainer,
          containerWidth,
        );
      } else {
        nextChat = clampChatColumnWidth(prevChat, containerWidth);
      }

      containerWidthRef.current = containerWidth;
      if (nextChat !== prevChat) {
        setChatColumnWidth(nextChat, containerWidth, false);
      }
      if (nextChat !== prevChat || prevContainer !== containerWidth) {
        dispatchWorkspaceLayoutResize();
      }
    };

    sync(true);
    const observer = new ResizeObserver(() => sync(false));
    observer.observe(el);
    return () => {
      observer.disconnect();
      containerWidthRef.current = null;
    };
  }, [measureRef, panelOpen, setChatColumnWidth]);

  if (!panelOpen || chatColumnWidth == null) return undefined;
  return {
    "--app-main-chat-width": `${chatColumnWidth}px`,
  } as CSSProperties;
}
