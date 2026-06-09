"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ActionMentionItem } from "@/lib/action-mention-items";
import { formatMentionItemMeta } from "@/lib/action-mention-items";
import { useActionMentionSearch } from "@/lib/use-action-mention-search";

type ToolTestActionRuntimeActionPickerProps = {
  disabled?: boolean;
  busy?: boolean;
  onRun: (item: ActionMentionItem, op: "run" | "check") => void;
};

const DROPDOWN_LIMIT = 5;

export function ToolTestActionRuntimeActionPicker({
  disabled,
  busy,
  onRun,
}: ToolTestActionRuntimeActionPickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<ActionMentionItem | null>(null);

  const trimmedQuery = query.trim();
  const searchActive = open && trimmedQuery.length > 0;
  const search = useActionMentionSearch(searchActive ? query : null, { limit: DROPDOWN_LIMIT });
  const items = search.items.filter((item) => item.kind !== "subprogram");

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root?.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, [close, open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, items.length]);

  const pick = useCallback(
    (item: ActionMentionItem) => {
      setSelected(item);
      setQuery(item.title);
      close();
    },
    [close],
  );

  const clearSelection = useCallback(() => {
    setSelected(null);
    setQuery("");
    inputRef.current?.focus();
  }, []);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (items.length === 0) return;
      setActiveIndex((i) => (i + 1) % items.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      setActiveIndex((i) => (i - 1 + items.length) % items.length);
      return;
    }
    if (event.key === "Enter" && items.length > 0) {
      event.preventDefault();
      const item = items[activeIndex] ?? items[0];
      if (item) pick(item);
    }
  };

  const showDropdown = Boolean(
    searchActive
      && !disabled
      && (search.isRefreshing || search.error || items.length > 0),
  );

  return (
    <section className="tool-test-runtime-group tool-test-runtime-action-picker">
      <h3 className="tool-test-runtime-group__title">Quicker 动作</h3>
      <p className="tool-test-runtime-action-picker__hint">
        输入名称或 GUID 后补全（最多 {DROPDOWN_LIMIT} 条），选中后运行。
      </p>

      <div ref={rootRef} className="tool-test-runtime-action-picker__combo">
        <input
          ref={inputRef}
          type="text"
          className="tool-test-runtime-field__input tool-test-runtime-action-picker__input"
          value={query}
          disabled={disabled || busy}
          placeholder="搜索动作…"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setOpen(true);
          }}
          onKeyDown={onInputKeyDown}
        />

        {showDropdown ? (
          <ul id={listId} className="tool-test-runtime-action-picker__menu" role="listbox">
            {search.error ? (
              <li className="tool-test-runtime-action-picker__empty">{search.error}</li>
            ) : null}
            {search.isRefreshing && items.length === 0 && !search.error ? (
              <li className="tool-test-runtime-action-picker__empty">搜索中…</li>
            ) : null}
            {!search.isRefreshing && !search.error && items.length === 0 && query.trim() ? (
              <li className="tool-test-runtime-action-picker__empty">无匹配动作</li>
            ) : null}
            {items.map((item, index) => {
              const meta = formatMentionItemMeta(item);
              return (
                <li key={item.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={[
                      "tool-test-runtime-action-picker__option",
                      index === activeIndex ? "tool-test-runtime-action-picker__option--active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(item)}
                  >
                    <span className="tool-test-runtime-action-picker__option-title">{item.title}</span>
                    {meta ? (
                      <span className="tool-test-runtime-action-picker__option-meta">{meta}</span>
                    ) : (
                      <span className="tool-test-runtime-action-picker__option-meta">{item.id}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {selected ? (
        <div className="tool-test-runtime-action-picker__selected">
          <div className="tool-test-runtime-case__text">
            <span className="tool-test-runtime-case__label">{selected.title}</span>
            <span className="tool-test-runtime-case__meta">{selected.id}</span>
          </div>
          <div className="tool-test-runtime-case__actions">
            <button
              type="button"
              className="tool-test-runtime-btn tool-test-runtime-btn--primary"
              disabled={disabled || busy}
              onClick={() => onRun(selected, "run")}
            >
              运行
            </button>
            <button
              type="button"
              className="tool-test-runtime-btn"
              disabled={disabled || busy}
              onClick={() => onRun(selected, "check")}
            >
              检查
            </button>
            <button
              type="button"
              className="tool-test-runtime-btn"
              disabled={disabled || busy}
              onClick={clearSelection}
            >
              清除
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
