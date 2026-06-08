"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ActionIcon } from "@/components/chat/ActionIcon";
import type { ActionMentionItem } from "@/lib/action-mention-items";
import {
  formatMentionItemMeta,
  resolveMentionItemIcon,
} from "@/lib/action-mention-items";
import { MENTION_GLOBAL_SUBPROGRAM_ICON_CLASS } from "@/lib/global-subprogram-icon";
import type { PinnedAction } from "@/lib/action-context";
import { computeMentionMenuLayout } from "@/lib/composer-mention-menu-layout";
import type { MentionSearchView } from "@/lib/use-action-mention-search";

type ComposerMentionMenuProps = {
  open: boolean;
  query: string;
  anchorRect: DOMRect | null;
  search: MentionSearchView;
  activeIndex: number;
  onSelect: (action: PinnedAction) => void;
};

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

function readViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return DEFAULT_VIEWPORT;
  return { width: window.innerWidth, height: window.innerHeight };
}

function viewportChanged(
  prev: { width: number; height: number },
  next: { width: number; height: number },
): boolean {
  return prev.width !== next.width || prev.height !== next.height;
}

export function ComposerMentionMenu({
  open,
  query,
  anchorRect,
  search,
  activeIndex,
  onSelect,
}: ComposerMentionMenuProps) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [viewport, setViewport] = useState(readViewportSize);

  useEffect(() => {
    const sync = () => {
      setViewport((prev) => {
        const next = readViewportSize();
        return viewportChanged(prev, next) ? next : prev;
      });
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, []);

  const items = search.items;
  const header =
    query.trim().length > 0
      ? `搜索「${query.trim()}」`
      : "动作与子程序";
  const showInitialLoading =
    search.isRefreshing && items.length === 0 && !search.error;
  const showEmpty =
    !search.isRefreshing && !search.error && items.length === 0;

  const style = useMemo(() => {
    if (!anchorRect) return undefined;
    const layout = computeMentionMenuLayout(anchorRect, viewport);
    return {
      top: layout.top,
      left: layout.left,
      maxHeight: layout.maxHeight,
      transform: layout.transform,
    };
  }, [anchorRect, viewport]);

  useEffect(() => {
    if (!open || items.length === 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-mention-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, items.length, open]);

  if (!open || !anchorRect || !style) return null;

  const activeOptionId =
    items.length > 0 ? `${listId}-option-${activeIndex}` : undefined;

  const menu = (
    <div
      className="composer-mention-menu"
      role="listbox"
      aria-label="引用动作"
      aria-busy={search.isRefreshing || undefined}
      aria-activedescendant={activeOptionId}
      style={style}
    >
      <div className="composer-mention-menu__header">
        <span>{header}</span>
        {search.isRefreshing && items.length > 0 && (
          <span className="composer-mention-menu__refresh" aria-hidden>
            …
          </span>
        )}
      </div>

      {showInitialLoading && (
        <p className="composer-mention-menu__status">搜索中…</p>
      )}

      {search.error && (
        <p className="composer-mention-menu__status composer-mention-menu__status--error">
          {search.error}
        </p>
      )}

      {showEmpty && (
        <p className="composer-mention-menu__status">没有匹配的动作</p>
      )}

      {items.length > 0 && (
        <ul
          ref={listRef}
          id={listId}
          className={`composer-mention-menu__list action-picker-list${search.isRefreshing ? " composer-mention-menu__list--refreshing" : ""}`}
        >
          {items.map((item: ActionMentionItem, index) => {
            const meta = formatMentionItemMeta(item);
            return (
              <li key={`${item.kind ?? "action"}:${item.id}`}>
                <button
                  type="button"
                  role="option"
                  id={`${listId}-option-${index}`}
                  tabIndex={-1}
                  aria-selected={index === activeIndex}
                  data-mention-index={index}
                  className={`action-picker-item action-picker-item--with-icon${
                    index === activeIndex ? " action-picker-item--selected" : ""
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(item);
                  }}
                >
                  <ActionIcon
                    spec={resolveMentionItemIcon(item)}
                    title={item.title}
                    className={
                      item.kind === "subprogram"
                        ? MENTION_GLOBAL_SUBPROGRAM_ICON_CLASS
                        : "action-picker-item-icon"
                    }
                  />
                  <span className="action-picker-item-body">
                    <span className="action-picker-item-title-row">
                      <span className="action-picker-item-title">{item.title}</span>
                      {item.kind === "subprogram" ? (
                        <span className="action-picker-item-kind">子程序</span>
                      ) : null}
                    </span>
                    {meta ? (
                      <span className="action-picker-item-meta">{meta}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
