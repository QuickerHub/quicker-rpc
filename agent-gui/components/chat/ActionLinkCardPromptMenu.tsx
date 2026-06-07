"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ACTION_LINK_CARD_PROMPTS,
  type ActionLinkCardPrompt,
} from "@/lib/action-link-card-prompts";
import { computeFloatingMenuLayout } from "@/lib/floating-menu-layout";
import { useMountedAriaControlsId } from "@/lib/use-mounted-aria-controls-id";

const MENU_WIDTH_PX = 188;
const MENU_MAX_HEIGHT_PX = 280;

type ActionLinkCardPromptMenuProps = {
  disabled?: boolean;
  onSelectPrompt: (promptId: string) => void;
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

function PromptMenuItem({
  prompt,
  onSelect,
}: {
  prompt: ActionLinkCardPrompt;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="msg-more-menu-item action-link-card-more-item"
      role="menuitem"
      title={prompt.hint}
      onClick={() => onSelect(prompt.id)}
    >
      <span className="action-link-card-more-item__label">{prompt.label}</span>
      <span className="action-link-card-more-item__hint">{prompt.hint}</span>
    </button>
  );
}

export function ActionLinkCardPromptMenu({
  disabled = false,
  onSelectPrompt,
}: ActionLinkCardPromptMenuProps) {
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

  const handleSelect = useCallback(
    (promptId: string) => {
      closeMenu();
      onSelectPrompt(promptId);
    },
    [closeMenu, onSelectPrompt],
  );

  const menu =
    menuOpen && menuLayout ? (
      <div
        ref={menuRef}
        id={menuId}
        className="composer-popup msg-more-menu-panel msg-more-menu-panel--portal action-link-card-more-panel"
        role="menu"
        aria-label="Agent 引导"
        style={{
          position: "fixed",
          top: menuLayout.top,
          left: menuLayout.left,
          width: MENU_WIDTH_PX,
          maxHeight: menuLayout.maxHeight,
          transform: menuLayout.transform,
        }}
      >
        {ACTION_LINK_CARD_PROMPTS.map((prompt) => (
          <PromptMenuItem
            key={prompt.id}
            prompt={prompt}
            onSelect={handleSelect}
          />
        ))}
      </div>
    ) : null;

  return (
    <div className="action-link-card-more msg-more-menu">
      <button
        ref={buttonRef}
        type="button"
        className="msg-more-menu-trigger"
        aria-label="Agent 引导"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        title="Agent 引导"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
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
