"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AgentCommandCatalogItem } from "@/lib/use-agent-defs";
import { computeMentionMenuLayout } from "@/lib/composer-mention-menu-layout";

type ComposerSlashMenuProps = {
  open: boolean;
  query: string;
  anchorRect: DOMRect | null;
  commands: AgentCommandCatalogItem[];
  loading: boolean;
  error: string | null;
  activeIndex: number;
  onSelect: (command: AgentCommandCatalogItem) => void;
};

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

function readViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return DEFAULT_VIEWPORT;
  return { width: window.innerWidth, height: window.innerHeight };
}

export function ComposerSlashMenu({
  open,
  query,
  anchorRect,
  commands,
  loading,
  error,
  activeIndex,
  onSelect,
}: ComposerSlashMenuProps) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [viewport, setViewport] = useState(readViewportSize);

  useEffect(() => {
    const sync = () => setViewport(readViewportSize());
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, []);

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
    if (!open || commands.length === 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-slash-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, commands.length, open]);

  if (!open || !anchorRect || !style) return null;

  const header =
    query.trim().length > 0
      ? `命令「${query.trim()}」`
      : "斜杠命令";

  return createPortal(
    <div
      className="composer-mention-menu composer-slash-menu"
      style={style}
      role="listbox"
      aria-label="斜杠命令"
    >
      <div className="composer-mention-menu__header">{header}</div>
      {loading && commands.length === 0 ? (
        <div className="composer-mention-menu__status">加载中…</div>
      ) : null}
      {error ? (
        <div className="composer-mention-menu__status composer-mention-menu__status--error">
          {error}
        </div>
      ) : null}
      {!loading && !error && commands.length === 0 ? (
        <div className="composer-mention-menu__status">无匹配命令</div>
      ) : null}
      {commands.length > 0 ? (
        <ul ref={listRef} id={listId} className="composer-mention-menu__list">
          {commands.map((command, index) => (
            <li key={command.name}>
              <button
                type="button"
                role="option"
                data-slash-index={index}
                aria-selected={index === activeIndex}
                className={`composer-mention-menu__item${
                  index === activeIndex ? " composer-mention-menu__item--active" : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelect(command)}
              >
                <span className="composer-slash-menu__name">/{command.name}</span>
                <span className="composer-mention-menu__meta">
                  {command.description}
                </span>
                {command.argumentHint ? (
                  <span className="composer-slash-menu__hint">
                    {command.argumentHint}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>,
    document.body,
  );
}
