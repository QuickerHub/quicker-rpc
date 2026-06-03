"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import {
  applyPlainTextEditableDom,
  plainTextEditableProps,
} from "@/lib/plain-text-editable";

type EditableInlineProps = {
  value: string;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  onCommit: (value: string) => void | Promise<void>;
};

export function EditableInline({
  value,
  placeholder,
  className,
  multiline = false,
  onCommit,
}: EditableInlineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const editingRef = useRef(false);

  const bindRoot = useCallback((el: HTMLDivElement | null) => {
    ref.current = el;
    applyPlainTextEditableDom(el);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || editingRef.current) return;
    const display = value || "";
    if (el.textContent !== display) {
      el.textContent = display;
    }
    el.dataset.empty = display ? "false" : "true";
  }, [value]);

  const commit = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    const raw = el.innerText.replace(/\r\n/g, "\n");
    const next = multiline ? raw.replace(/\n+$/g, "") : raw.replace(/\n/g, " ").trim();
    if (next !== value) {
      await onCommit(next);
    }
    el.dataset.empty = next ? "false" : "true";
  }, [multiline, onCommit, value]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!multiline && e.key === "Enter") {
        e.preventDefault();
        e.currentTarget.blur();
      }
      if (multiline && e.key === "Escape") {
        e.preventDefault();
        const el = ref.current;
        if (el) {
          el.textContent = value;
          el.dataset.empty = value ? "false" : "true";
        }
        e.currentTarget.blur();
      }
    },
    [multiline, value],
  );

  return (
    <div
      ref={bindRoot}
      role="textbox"
      aria-multiline={multiline || undefined}
      aria-placeholder={placeholder}
      className={`project-info-editable${className ? ` ${className}` : ""}`}
      contentEditable
      {...plainTextEditableProps}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      data-empty={value ? "false" : "true"}
      onFocus={() => {
        editingRef.current = true;
      }}
      onBlur={() => {
        editingRef.current = false;
        void commit();
      }}
      onKeyDown={onKeyDown}
    />
  );
}
