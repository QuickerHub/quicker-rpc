"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ChatThread } from "@/lib/chat-store";
import { computeFloatingMenuLayout } from "@/lib/floating-menu-layout";
import { composerPopupPortalClassNames } from "@/lib/composer-popup-classes";
import { useMountedAriaControlsId } from "@/lib/use-mounted-aria-controls-id";

const MENU_WIDTH_PX = 168;
const MENU_MAX_HEIGHT_PX = 220;

export type ThreadSidebarContextMenuState = {
  threadId: string;
  x: number;
  y: number;
};

type ThreadSidebarContextMenuProps = {
  open: boolean;
  anchor: ThreadSidebarContextMenuState | null;
  thread: ChatThread | null;
  pinned: boolean;
  exportDisabled?: boolean;
  disabled?: boolean;
  onClose: () => void;
  onExport: () => void;
  onTogglePin: () => void;
  onStartRename: () => void;
  onRequestDelete: () => void;
};

export function ThreadSidebarContextMenu({
  open,
  anchor,
  thread,
  pinned,
  exportDisabled = false,
  disabled = false,
  onClose,
  onExport,
  onTogglePin,
  onStartRename,
  onRequestDelete,
}: ThreadSidebarContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useMountedAriaControlsId();
  const [menuLayout, setMenuLayout] = useState<ReturnType<
    typeof computeFloatingMenuLayout
  > | null>(null);

  const updateMenuLayout = useCallback(() => {
    if (!anchor) return;
    const rect = new DOMRect(anchor.x, anchor.y, 0, 0);
    setMenuLayout(
      computeFloatingMenuLayout(
        rect,
        MENU_WIDTH_PX,
        MENU_MAX_HEIGHT_PX,
        "start",
      ),
    );
  }, [anchor]);

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setMenuLayout(null);
      return;
    }
    updateMenuLayout();
    window.addEventListener("resize", updateMenuLayout);
    window.addEventListener("scroll", updateMenuLayout, true);
    return () => {
      window.removeEventListener("resize", updateMenuLayout);
      window.removeEventListener("scroll", updateMenuLayout, true);
    };
  }, [anchor, open, updateMenuLayout]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open || !anchor || !thread || !menuLayout) return null;

  const run = (action: () => void) => {
    action();
    onClose();
  };

  const menu = (
    <div
      ref={menuRef}
      id={menuId}
      className={composerPopupPortalClassNames(
        "msg-more-menu-panel",
        "ws-thread-context-menu",
        "msg-more-menu-panel--portal",
      )}
      role="menu"
      style={{
        position: "fixed",
        top: menuLayout.top,
        left: menuLayout.left,
        width: MENU_WIDTH_PX,
        maxHeight: menuLayout.maxHeight,
        transform: menuLayout.transform,
      }}
    >
      <button
        type="button"
        className="msg-more-menu-item"
        role="menuitem"
        disabled={disabled || exportDisabled}
        onClick={() => run(onExport)}
      >
        {exportDisabled ? "导出中…" : "导出对话"}
      </button>
      <button
        type="button"
        className="msg-more-menu-item"
        role="menuitem"
        disabled={disabled}
        onClick={() => run(onTogglePin)}
      >
        {pinned ? "取消置顶" : "置顶对话"}
      </button>
      <button
        type="button"
        className="msg-more-menu-item"
        role="menuitem"
        disabled={disabled}
        onClick={() => run(onStartRename)}
      >
        重命名
      </button>
      <button
        type="button"
        className="msg-more-menu-item"
        role="menuitem"
        disabled={disabled}
        onClick={() => run(onRequestDelete)}
      >
        删除对话
      </button>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(menu, document.body) : null;
}
