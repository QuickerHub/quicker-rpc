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
  /** When false, blur does not call onCommit (use explicit save). Default true. */
  commitOnBlur?: boolean;
  onDraftChange?: (value: string) => void;
  onCommit: (value: string) => void | Promise<void>;
};

export function EditableInline({
  value,
  placeholder,
  className,
  multiline = false,
  commitOnBlur = true,
  onDraftChange,
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

  const readDraft = useCallback(() => {
    const el = ref.current;
    if (!el) return value;
    const raw = el.innerText.replace(/\r\n/g, "\n");
    return multiline ? raw.replace(/\n+$/g, "") : raw.replace(/\n/g, " ").trim();
  }, [multiline, value]);

  const commit = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    const next = readDraft();
    if (next !== value) {
      await onCommit(next);
    }
    el.dataset.empty = next ? "false" : "true";
  }, [onCommit, readDraft, value]);

  const notifyDraft = useCallback(() => {
    onDraftChange?.(readDraft());
  }, [onDraftChange, readDraft]);

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
      onInput={notifyDraft}
      onBlur={() => {
        editingRef.current = false;
        if (commitOnBlur) {
          void commit();
        } else {
          notifyDraft();
        }
      }}
      onKeyDown={onKeyDown}
    />
  );
}
