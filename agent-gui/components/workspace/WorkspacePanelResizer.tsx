"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { dispatchWorkspaceLayoutResize } from "@/lib/embedded-webview-bounds";
import { storeChatColumnWidth } from "@/lib/explorer-prefs";

type Props = {
  chatColumnWidth: number | null;
  setChatColumnWidth: (width: number, containerWidth: number, persist?: boolean) => void;
};

export function WorkspacePanelResizer({ chatColumnWidth, setChatColumnWidth }: Props) {
  const stopDrag = useRef<(() => void) | null>(null);
  useLayoutEffect(() => () => stopDrag.current?.(), []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || chatColumnWidth == null) return;
    e.preventDefault();
    const splitHost = e.currentTarget.closest<HTMLElement>(".app-main-body");
    if (!splitHost) return;
    const startX = e.clientX;
    const startChatWidth = splitHost.querySelector<HTMLElement>(".app-main-chat-column")?.getBoundingClientRect().width;
    if (!startChatWidth) return;
    stopDrag.current?.();
    const resizer = e.currentTarget;
    const eventDocument = splitHost.ownerDocument;
    const pointerId = e.pointerId;
    const isPresented = () => resizer.isConnected && resizer.getClientRects().length > 0;
    let active = true;
    let latestChatWidth = startChatWidth;
    let moved = false;
    eventDocument.body.classList.add("workspace-explorer-resizing");
    const visibilityObserver = new ResizeObserver(() => {
      if (!isPresented()) dispose();
    });
    const dispose = () => {
      if (!active) return false;
      active = false;
      eventDocument.removeEventListener("pointermove", onMove);
      eventDocument.removeEventListener("pointerup", onUp);
      eventDocument.removeEventListener("pointercancel", onCancel);
      visibilityObserver.disconnect();
      eventDocument.body.classList.remove("workspace-explorer-resizing");
      if (stopDrag.current === dispose) stopDrag.current = null;
      return true;
    };
    const onMove = (ev: PointerEvent) => {
      if (!active || ev.pointerId !== pointerId) return;
      if (!isPresented()) { dispose(); return; }
      const containerWidth = splitHost.getBoundingClientRect().width;
      if (containerWidth <= 0) return;
      if (!moved && ev.clientX === startX) return;
      moved = true;
      latestChatWidth = startChatWidth + (ev.clientX - startX);
      setChatColumnWidth(latestChatWidth, containerWidth, false);
      dispatchWorkspaceLayoutResize();
    };
    const onUp = (ev: PointerEvent) => {
      if (!isPresented()) { dispose(); return; }
      if (ev.pointerId !== pointerId || !dispose()) return;
      dispatchWorkspaceLayoutResize();
      const containerWidth = splitHost.getBoundingClientRect().width;
      if (containerWidth > 0 && moved && latestChatWidth !== startChatWidth) {
        storeChatColumnWidth(latestChatWidth, containerWidth);
      } else if (containerWidth > 0 && moved) {
        setChatColumnWidth(chatColumnWidth, containerWidth, false);
      }
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) dispose();
    };
    stopDrag.current = dispose;
    eventDocument.addEventListener("pointermove", onMove);
    eventDocument.addEventListener("pointerup", onUp);
    eventDocument.addEventListener("pointercancel", onCancel);
    visibilityObserver.observe(resizer);
  }, [chatColumnWidth, setChatColumnWidth]);

  return <div className="workspace-explorer-resizer" role="separator" aria-orientation="vertical"
    aria-label="调整侧栏宽度" onPointerDown={handlePointerDown} />;
}
