"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { PinnedAction } from "@/lib/action-context";
import {
  applyComposerMentionTag,
  getComposerMentionAnchorRect,
  getComposerMentionMatch,
} from "@/lib/composer-mention";
import {
  canSendComposedMessage,
  hasPasteableUserMessageFormat,
} from "@/lib/compose-user-message";
import {
  createComposerTagElement,
  deleteComposerTagWithUndo,
  ensureEmptyComposerCaret,
  findComposerTagForBackspace,
  findComposerTagForDelete,
  insertComposerMarkupPasteWithUndo,
  insertPlainTextWithUndo,
  normalizeEmptyComposerRoot,
  placeCaretAtEnd,
  placeCaretAtStart,
  renderMarkupIntoRoot,
  selectionHasComposerTags,
  serializeComposerRange,
  serializeComposerRoot,
} from "@/lib/composer-inline";
import {
  applyPlainTextEditableDom,
  plainTextEditableProps,
} from "@/lib/plain-text-editable";
import { useActionMentionSearch } from "@/lib/use-action-mention-search";
import { ComposerMentionMenu } from "./ComposerMentionMenu";

export type ComposerMarkupFieldHandle = {
  focus: () => void;
  /** Focus composer and place caret at end of content (e.g. branch-edit). */
  focusAtEnd: () => void;
  insertActionTag: (action: PinnedAction) => void;
};

type ComposerMarkupFieldProps = {
  value: string;
  placeholder: string;
  disabled: boolean;
  qkrpcOk: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

function insertNodeAtSelection(root: HTMLElement, node: Node): void {
  const selection = window.getSelection();
  if (!selection) {
    root.append(node);
    return;
  }

  if (!selection.rangeCount || !root.contains(selection.anchorNode)) {
    root.append(node);
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export const ComposerMarkupField = forwardRef<
  ComposerMarkupFieldHandle,
  ComposerMarkupFieldProps
>(function ComposerMarkupField(
  { value, placeholder, disabled, qkrpcOk, onChange, onSubmit },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);

  const bindComposerRoot = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el;
    applyPlainTextEditableDom(el);
  }, []);
  const lastEmitted = useRef(value);
  const mounted = useRef(false);
  const mentionRangeRef = useRef<Range | null>(null);
  const lastMentionQueryRef = useRef<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionAnchorRect, setMentionAnchorRect] = useState<DOMRect | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const mentionSearch = useActionMentionSearch(mentionQuery);
  const mentionOpen = mentionQuery !== null && !disabled;
  const mentionItems = mentionSearch.items;

  const emitChange = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const next = serializeComposerRoot(root);
    lastEmitted.current = next;
    onChange(next);
  }, [onChange]);

  const closeMention = useCallback(() => {
    mentionRangeRef.current = null;
    lastMentionQueryRef.current = null;
    setMentionQuery(null);
    setMentionAnchorRect(null);
    setMentionActiveIndex(0);
  }, []);

  const syncMentionFromCaret = useCallback(() => {
    const root = rootRef.current;
    if (!root || disabled) {
      closeMention();
      return;
    }
    const match = getComposerMentionMatch(root);
    if (!match) {
      closeMention();
      return;
    }
    mentionRangeRef.current = match.range.cloneRange();
    const nextRect = getComposerMentionAnchorRect(match.range);
    setMentionAnchorRect((prev) => {
      if (
        prev
        && Math.abs(prev.top - nextRect.top) < 1
        && Math.abs(prev.left - nextRect.left) < 1
        && Math.abs(prev.bottom - nextRect.bottom) < 1
      ) {
        return prev;
      }
      return nextRect;
    });
    if (lastMentionQueryRef.current !== match.query) {
      lastMentionQueryRef.current = match.query;
      setMentionActiveIndex(0);
    }
    setMentionQuery(match.query);
  }, [closeMention, disabled]);

  const applyMentionSelection = useCallback(
    (action: PinnedAction) => {
      const root = rootRef.current;
      const range = mentionRangeRef.current;
      if (!root || !range) return;
      applyComposerMentionTag(root, range, action);
      closeMention();
      emitChange();
    },
    [closeMention, emitChange],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => rootRef.current?.focus(),
      focusAtEnd: () => {
        const root = rootRef.current;
        if (!root || disabled) return;
        if (value !== lastEmitted.current) {
          renderMarkupIntoRoot(root, value);
          lastEmitted.current = value;
        }
        root.focus({ preventScroll: true });
        placeCaretAtEnd(root);
      },
      insertActionTag: (action: PinnedAction) => {
        const root = rootRef.current;
        if (!root || disabled) return;
        closeMention();
        insertNodeAtSelection(root, createComposerTagElement(action));
        insertNodeAtSelection(root, document.createTextNode("\u00a0"));
        emitChange();
        root.focus();
      },
    }),
    [closeMention, disabled, emitChange, value],
  );

  useEffect(() => {
    if (!mentionOpen) return;
    if (mentionItems.length === 0) {
      setMentionActiveIndex(0);
      return;
    }
    setMentionActiveIndex((index) =>
      index >= mentionItems.length ? 0 : index,
    );
  }, [mentionItems.length, mentionOpen]);

  useEffect(() => {
    if (!mentionOpen) return;
    const refreshAnchor = () => {
      const range = mentionRangeRef.current;
      if (!range) return;
      const nextRect = getComposerMentionAnchorRect(range);
      setMentionAnchorRect((prev) => {
        if (
          prev
          && Math.abs(prev.top - nextRect.top) < 1
          && Math.abs(prev.left - nextRect.left) < 1
          && Math.abs(prev.bottom - nextRect.bottom) < 1
        ) {
          return prev;
        }
        return nextRect;
      });
    };
    window.addEventListener("resize", refreshAnchor);
    window.addEventListener("scroll", refreshAnchor, true);
    return () => {
      window.removeEventListener("resize", refreshAnchor);
      window.removeEventListener("scroll", refreshAnchor, true);
    };
  }, [mentionOpen]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (!mounted.current) {
      mounted.current = true;
      renderMarkupIntoRoot(root, value);
      lastEmitted.current = value;
      return;
    }

    const focused = document.activeElement === root;
    if (focused) {
      if (value !== lastEmitted.current && !value.trim()) {
        renderMarkupIntoRoot(root, "");
        lastEmitted.current = "";
        placeCaretAtStart(root);
      }
      return;
    }

    if (value === lastEmitted.current) return;
    renderMarkupIntoRoot(root, value);
    lastEmitted.current = value;
  }, [value]);

  const handleInput = () => {
    syncMentionFromCaret();
    emitChange();
  };

  const handleBeforeInput = (event: React.FormEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const native = event.nativeEvent as InputEvent;

    if (native.inputType === "deleteContentBackward") {
      const tag = findComposerTagForBackspace(root);
      if (tag) {
        event.preventDefault();
        deleteComposerTagWithUndo(tag, root);
        emitChange();
        ensureEmptyComposerCaret(root);
      }
      return;
    }

    if (native.inputType === "deleteContentForward") {
      const tag = findComposerTagForDelete(root);
      if (tag) {
        event.preventDefault();
        deleteComposerTagWithUndo(tag, root);
        emitChange();
      }
    }
  };

  const handleBlur = () => {
    const root = rootRef.current;
    window.setTimeout(() => closeMention(), 120);
    if (!root) return;
    if (normalizeEmptyComposerRoot(root)) {
      placeCaretAtStart(root);
      emitChange();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const root = rootRef.current;
    if (!root) return;

    const text = event.clipboardData.getData("text/plain");
    if (!text) return;

    if (hasPasteableUserMessageFormat(text)) {
      insertComposerMarkupPasteWithUndo(root, text);
    } else {
      insertPlainTextWithUndo(root, text);
    }
    emitChange();
    requestAnimationFrame(() => ensureEmptyComposerCaret(root));
  };

  const handleCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    if (!root.contains(selection.anchorNode)) return;

    const range = selection.getRangeAt(0);
    const clip = serializeComposerRange(range);
    const useMarkup =
      selectionHasComposerTags(range)
      || hasPasteableUserMessageFormat(clip);
    if (!useMarkup) return;

    event.preventDefault();
    event.clipboardData.setData("text/plain", clip);
  };

  const handleCut = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    if (!root.contains(selection.anchorNode)) return;

    const range = selection.getRangeAt(0);
    const clip = serializeComposerRange(range);
    const useMarkup =
      selectionHasComposerTags(range)
      || hasPasteableUserMessageFormat(clip);
    if (!useMarkup) return;

    event.clipboardData.setData("text/plain", clip);
    queueMicrotask(() => {
      emitChange();
      ensureEmptyComposerCaret(root);
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;

    if (mentionOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMention();
        return;
      }
      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp")
        && mentionItems.length > 0
      ) {
        event.preventDefault();
        setMentionActiveIndex((index) => {
          if (event.key === "ArrowDown") {
            return (index + 1) % mentionItems.length;
          }
          return (index - 1 + mentionItems.length) % mentionItems.length;
        });
        return;
      }
      if (
        (event.key === "Enter" || event.key === "Tab")
        && mentionItems.length > 0
      ) {
        event.preventDefault();
        applyMentionSelection(mentionItems[mentionActiveIndex]);
        return;
      }
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      const tag =
        event.key === "Backspace"
          ? findComposerTagForBackspace(root)
          : findComposerTagForDelete(root);
      if (tag) {
        event.preventDefault();
        deleteComposerTagWithUndo(tag, root);
        emitChange();
        if (event.key === "Backspace") {
          ensureEmptyComposerCaret(root);
        }
      }
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !mentionOpen) {
      event.preventDefault();
      onSubmit();
    }
  };

  const isEmpty = !canSendComposedMessage(value);

  return (
    <div
      className="composer-field composer-field--markup"
      role="group"
      aria-label="消息输入"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          rootRef.current?.focus();
        }
      }}
    >
      <div
        ref={bindComposerRoot}
        className={`composer-inline-input${isEmpty ? " composer-inline-input--empty" : ""}`}
        contentEditable={!disabled}
        {...plainTextEditableProps}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        data-placeholder={placeholder}
        onInput={handleInput}
        onBeforeInput={handleBeforeInput}
        onBlur={handleBlur}
        onPaste={handlePaste}
        onCopy={handleCopy}
        onCut={handleCut}
        onKeyDown={handleKeyDown}
      />
      <ComposerMentionMenu
        open={mentionOpen}
        query={mentionQuery ?? ""}
        anchorRect={mentionAnchorRect}
        search={mentionSearch}
        activeIndex={mentionActiveIndex}
        onSelect={applyMentionSelection}
      />
    </div>
  );
});
