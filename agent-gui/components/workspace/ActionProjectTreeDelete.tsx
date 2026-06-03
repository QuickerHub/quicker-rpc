"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ExplorerTreeNode } from "@/lib/action-explorer-tree";
import {
  displayNodeLabel,
  resolveActionProjectId,
} from "@/lib/action-explorer-tree";
import { computeFloatingMenuLayout } from "@/lib/floating-menu-layout";
import { useActionProjectDelete } from "@/lib/use-action-project-delete";

const DELETE_MENU_WIDTH_PX = 208;

type ActionProjectTreeDeleteProps = {
  node: ExplorerTreeNode;
  rootPath: string;
  cwd: string;
  onDeleted?: () => void;
};

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 3.5h7M4.5 3.5V2.5h3v1M5 5.5v3M7 5.5v3M3.5 3.5l.5 6h4l.5-6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ActionProjectTreeDelete({
  node,
  rootPath,
  cwd,
  onDeleted,
}: ActionProjectTreeDeleteProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState<{
    top: number;
    left: number;
    maxHeight: number;
    transform?: string;
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const actionId = resolveActionProjectId(node);
  const projectPath = node.path.replace(/\\/g, "/");
  const displayTitle = displayNodeLabel(node, rootPath);

  const { disabled, deleteInWorkspaceOnly, deleteDirect } = useActionProjectDelete({
    actionId: actionId ?? projectPath.split("/").pop() ?? projectPath,
    projectPath,
    cwd,
    displayTitle,
    onWorkspaceDeleted: onDeleted,
    onQuickerDeleted: onDeleted,
  });

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const updateMenuLayout = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    setMenuLayout(
      computeFloatingMenuLayout(
        button.getBoundingClientRect(),
        DELETE_MENU_WIDTH_PX,
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
      const target = event.target as Node;
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

  const handleWorkspaceDelete = useCallback(async () => {
    closeMenu();
    await deleteInWorkspaceOnly({ confirm: false });
  }, [closeMenu, deleteInWorkspaceOnly]);

  const handleDirectDelete = useCallback(async () => {
    closeMenu();
    await deleteDirect({ confirm: false });
  }, [closeMenu, deleteDirect]);

  const menu =
    menuOpen && menuLayout ? (
      <div
        ref={menuRef}
        id={menuId}
        className="composer-popup explorer-tree-delete-menu explorer-tree-delete-menu--portal"
        role="menu"
        aria-label={`删除 ${displayTitle}`}
        style={{
          position: "fixed",
          top: menuLayout.top,
          left: menuLayout.left,
          width: DELETE_MENU_WIDTH_PX,
          maxHeight: menuLayout.maxHeight,
          transform: menuLayout.transform,
          zIndex: 260,
        }}
      >
        <p className="explorer-tree-delete-menu-title">{displayTitle}</p>
        <button
          type="button"
          className="explorer-tree-delete-menu-item"
          role="menuitem"
          onClick={() => void handleWorkspaceDelete()}
        >
          <span className="explorer-tree-delete-menu-item-label">
            仅在工作区删除
          </span>
          <span className="explorer-tree-delete-menu-item-hint">
            仅移除 .quicker/actions 目录，Quicker 动作库保留
          </span>
        </button>
        {actionId ? (
          <button
            type="button"
            className="explorer-tree-delete-menu-item explorer-tree-delete-menu-item--danger"
            role="menuitem"
            onClick={() => void handleDirectDelete()}
          >
            <span className="explorer-tree-delete-menu-item-label">
              同时删除动作
            </span>
            <span className="explorer-tree-delete-menu-item-hint">
              工作区与 Quicker 一并删除，不可撤销
            </span>
          </button>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <div
        className="explorer-tree-row-actions"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={buttonRef}
          type="button"
          className="explorer-tree-row-action explorer-tree-row-action--icon explorer-tree-row-action--danger"
          disabled={disabled}
          title="删除"
          aria-label={`删除 ${displayTitle}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <IconTrash />
        </button>
      </div>
      {typeof document !== "undefined" && menu
        ? createPortal(menu, document.body)
        : null}
    </>
  );
}
