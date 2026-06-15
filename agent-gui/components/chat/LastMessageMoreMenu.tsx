"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { AgentUIMessage } from "@/lib/chat-types";
import { pushAppMessage } from "@/lib/app-messages";
import { extractMessageCopyText } from "@/lib/extract-message-copy-text";
import { computeFloatingMenuLayout } from "@/lib/floating-menu-layout";
import { useMountedAriaControlsId } from "@/lib/use-mounted-aria-controls-id";

const MENU_WIDTH_PX = 168;
const MENU_MAX_HEIGHT_PX = 160;

type LastMessageMoreMenuProps = {
  message: AgentUIMessage;
  userTextOverride?: string;
  canFork?: boolean;
  onFork?: () => void;
};

function IconMoreHorizontal() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="3" cy="7" r="1" fill="currentColor" />
      <circle cx="7" cy="7" r="1" fill="currentColor" />
      <circle cx="11" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}

async function writeClipboardText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through */
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function LastMessageMoreMenu({
  message,
  userTextOverride,
  canFork = false,
  onFork,
}: LastMessageMoreMenuProps) {
  const copyText = extractMessageCopyText(message, userTextOverride);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState<ReturnType<
    typeof computeFloatingMenuLayout
  > | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useMountedAriaControlsId();

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const updateMenuLayout = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    setMenuLayout(
      computeFloatingMenuLayout(
        button.getBoundingClientRect(),
        MENU_WIDTH_PX,
        MENU_MAX_HEIGHT_PX,
        "end",
      ),
    );
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) {
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
  }, [menuOpen, updateMenuLayout]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMenu, menuOpen]);

  const handleCopy = useCallback(async () => {
    if (!copyText) return;
    const ok = await writeClipboardText(copyText);
    closeMenu();
    pushAppMessage({
      kind: ok ? "success" : "error",
      body: ok ? "已复制到剪贴板" : "复制失败，请手动选择文本复制",
      autoDismissMs: ok ? 2200 : 4000,
    });
  }, [closeMenu, copyText]);

  const handleFork = useCallback(() => {
    if (!canFork || !onFork) return;
    onFork();
    closeMenu();
    pushAppMessage({
      kind: "success",
      body: "已在新对话中复制上下文",
      autoDismissMs: 2200,
    });
  }, [canFork, closeMenu, onFork]);

  if (!copyText && !canFork) return null;

  const menu =
    menuOpen && menuLayout ? (
      <div
        ref={menuRef}
        id={menuId}
        className="composer-popup msg-more-menu-panel msg-more-menu-panel--portal"
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
        {copyText ? (
          <button
            type="button"
            className="msg-more-menu-item"
            role="menuitem"
            onClick={() => void handleCopy()}
          >
            复制
          </button>
        ) : null}
        {canFork ? (
          <button
            type="button"
            className="msg-more-menu-item"
            role="menuitem"
            onClick={handleFork}
          >
            分叉对话
          </button>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="msg-more-menu">
      <button
        ref={buttonRef}
        type="button"
        className="msg-more-menu-trigger"
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        title="更多"
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((open) => !open);
        }}
      >
        <IconMoreHorizontal />
      </button>
      {typeof document !== "undefined" && menu
        ? createPortal(menu, document.body)
        : null}
    </div>
  );
}
