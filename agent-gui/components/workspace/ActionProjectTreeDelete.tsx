"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ExplorerTreeNode } from "@/lib/action-explorer-tree";
import {
  displayNodeLabel,
  resolveActionProjectId,
} from "@/lib/action-explorer-tree";
import { useActionProjectDelete } from "@/lib/use-action-project-delete";

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
  const rootRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
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

  return (
    <div
      ref={rootRef}
      className="explorer-tree-row-actions"
      onClick={(e) => e.stopPropagation()}
    >
      <button
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

      {menuOpen ? (
        <div
          id={menuId}
          className="composer-popup explorer-tree-delete-menu"
          role="menu"
          aria-label={`删除 ${displayTitle}`}
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
      ) : null}
    </div>
  );
}
