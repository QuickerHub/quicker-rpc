"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SlashCatalogItem, SlashItemKind, SlashMenuSection } from "@/lib/composer-slash-catalog";
import {
  slashItemLabel,
  stripSlashDescriptionPreview,
} from "@/lib/composer-slash-catalog";
import { computeMentionMenuLayout } from "@/lib/composer-mention-menu-layout";

type ComposerSlashMenuProps = {
  open: boolean;
  query: string;
  anchorRect: DOMRect | null;
  sections: SlashMenuSection[];
  flatVisible: SlashCatalogItem[];
  loading: boolean;
  error: string | null;
  activeIndex: number;
  onSelect: (item: SlashCatalogItem) => void;
  onExpandSection: (kind: SlashItemKind) => void;
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
  sections,
  flatVisible,
  loading,
  error,
  activeIndex,
  onSelect,
  onExpandSection,
}: ComposerSlashMenuProps) {
  const listId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
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
    if (!open || flatVisible.length === 0) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-slash-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, flatVisible.length, open]);

  if (!open || !anchorRect || !style) return null;

  let flatIndex = 0;

  return createPortal(
    <div
      className="composer-mention-menu composer-slash-menu"
      style={style}
      role="listbox"
      aria-label="斜杠菜单"
      id={listId}
    >
      {loading && flatVisible.length === 0 ? (
        <p className="composer-slash-menu__status">加载中…</p>
      ) : null}
      {error ? (
        <p className="composer-slash-menu__status composer-slash-menu__status--error">
          {error}
        </p>
      ) : null}
      {!loading && !error && flatVisible.length === 0 ? (
        <p className="composer-slash-menu__status">无匹配项</p>
      ) : null}
      {sections.length > 0 ? (
        <div ref={scrollRef} className="composer-slash-menu__sections">
          {sections.map((section, sectionIndex) => (
            <section
              key={section.kind}
              className={`composer-slash-menu__section${
                sectionIndex > 0 ? " composer-slash-menu__section--bordered" : ""
              }`}
              aria-label={section.heading}
            >
              <h3 className="composer-slash-menu__section-heading">
                {section.heading}
              </h3>
              <ul className="composer-slash-menu__list">
                {section.visibleItems.map((item) => {
                  const index = flatIndex;
                  flatIndex += 1;
                  const description = stripSlashDescriptionPreview(item.description);
                  return (
                    <li key={`${item.kind}:${item.name}`}>
                      <button
                        type="button"
                        role="option"
                        data-slash-index={index}
                        aria-selected={index === activeIndex}
                        className={`composer-slash-menu__item${
                          index === activeIndex
                            ? " composer-slash-menu__item--active"
                            : ""
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onSelect(item)}
                      >
                        <span className="composer-slash-menu__title">
                          {slashItemLabel(item)}
                        </span>
                        {description ? (
                          <span className="composer-slash-menu__description">
                            {description}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {section.hiddenCount > 0 ? (
                <button
                  type="button"
                  className="composer-slash-menu__more"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onExpandSection(section.kind)}
                >
                  Show {section.hiddenCount} more
                </button>
              ) : null}
            </section>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
