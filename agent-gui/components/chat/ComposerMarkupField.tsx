"use client";

import {
  forwardRef,
  useMemo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { PinnedAction } from "@/lib/action-context";
import type { BrowserElementTag } from "@/lib/browser-element-tag";
import {
  applyComposerMentionTag,
  getComposerMentionAnchorRect,
  getComposerMentionMatch,
} from "@/lib/composer-mention";
import {
  applyComposerSlashCommand,
  getComposerSlashAnchorRect,
  getComposerSlashMatch,
} from "@/lib/composer-slash-command";
import {
  filterSlashCommands,
  useAgentDefsCatalog,
} from "@/lib/use-agent-defs";
import {
  canSendComposedMessage,
  hasPasteableUserMessageFormat,
} from "@/lib/compose-user-message";
import {
  beginComposerVoiceStream,
  cancelComposerVoiceStream,
  createBrowserElementTagElement,
  createComposerTagElement,
  createComposerTagSpacer,
  deleteComposerTagWithUndo,
  endComposerVoiceStream,
  ensureEmptyComposerCaret,
  findComposerTagForBackspace,
  findComposerTagForDelete,
  insertComposerMarkupPasteWithUndo,
  insertPlainTextWithUndo,
  normalizeEmptyComposerRoot,
  placeCaretAfterComposerTagSpacer,
  placeCaretAtEnd,
  placeCaretAtStart,
  renderMarkupIntoRoot,
  selectionHasComposerTags,
  serializeComposerRange,
  serializeComposerRoot,
  updateComposerVoiceStream,
} from "@/lib/composer-inline";
import {
  applyPlainTextEditableDom,
  plainTextEditableProps,
} from "@/lib/plain-text-editable";
import {
  hydrateComposerTagIcons,
  preloadComposerTagIcons,
} from "@/lib/composer-tag-present";
import { subscribeFaIconCache } from "@/lib/fa-icon-cache";
import { useActionMentionSearch } from "@/lib/use-action-mention-search";
import { useComposerTagPreview } from "@/lib/use-composer-tag-preview";
import { ComposerMentionMenu } from "./ComposerMentionMenu";
import { ComposerSlashMenu } from "./ComposerSlashMenu";
import { ComposerTagPreviewPopover } from "./ComposerTagPreviewPopover";

export type ComposerMarkupFieldHandle = {
  focus: () => void;
  /** Focus composer and place caret at end of content (e.g. branch-edit). */
  focusAtEnd: () => void;
  insertActionTag: (action: PinnedAction) => void;
  insertBrowserElementTag: (element: BrowserElementTag) => void;
  /** Insert @ and open the action mention picker (onboarding / toolbar). */
  insertMentionTrigger: () => void;
  /** Insert plain text at caret (e.g. pasted snippets). */
  insertPlainText: (text: string) => void;
  beginVoiceStream: () => void;
  updateVoiceStream: (text: string) => void;
  endVoiceStream: (finalText?: string) => void;
  cancelVoiceStream: () => void;
  /** Current serialized composer value (includes in-progress voice stream text). */
  getValue: () => string;
};

type ComposerMarkupFieldProps = {
  value: string;
  placeholder: string;
  disabled?: boolean;
  workingDirectory?: string;
  enableSlashCommands?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Called when the user edits the field (keyboard/paste/IME); e.g. stop voice input. */
  onUserEdit?: () => void;
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
  {
    value,
    placeholder,
    disabled = false,
    workingDirectory = "",
    enableSlashCommands = false,
    onChange,
    onSubmit,
    onUserEdit,
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tagPreview = useComposerTagPreview(rootRef);
  const onUserEditRef = useRef(onUserEdit);
  onUserEditRef.current = onUserEdit;

  const notifyUserEdit = useCallback(() => {
    onUserEditRef.current?.();
  }, []);

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

  const slashRangeRef = useRef<Range | null>(null);
  const lastSlashQueryRef = useRef<string | null>(null);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashAnchorRect, setSlashAnchorRect] = useState<DOMRect | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const slashCatalog = useAgentDefsCatalog(
    enableSlashCommands ? workingDirectory : "",
  );
  const slashItems = useMemo(
    () => filterSlashCommands(slashCatalog.commands, slashQuery ?? ""),
    [slashCatalog.commands, slashQuery],
  );
  const slashOpen =
    enableSlashCommands && slashQuery !== null && !disabled && mentionQuery === null;

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

  const closeSlash = useCallback(() => {
    slashRangeRef.current = null;
    lastSlashQueryRef.current = null;
    setSlashQuery(null);
    setSlashAnchorRect(null);
    setSlashActiveIndex(0);
  }, []);

  const closeMenus = useCallback(() => {
    closeMention();
    closeSlash();
  }, [closeMention, closeSlash]);

  const syncSlashFromCaret = useCallback(() => {
    const root = rootRef.current;
    if (!root || disabled || !enableSlashCommands) {
      closeSlash();
      return;
    }
    const match = getComposerSlashMatch(root);
    if (!match) {
      closeSlash();
      return;
    }
    slashRangeRef.current = match.range.cloneRange();
    const nextRect = getComposerSlashAnchorRect(match.range);
    setSlashAnchorRect((prev) => {
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
    if (lastSlashQueryRef.current !== match.query) {
      lastSlashQueryRef.current = match.query;
      setSlashActiveIndex(0);
    }
    setSlashQuery(match.query);
  }, [closeSlash, disabled, enableSlashCommands]);

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
    closeSlash();
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
  }, [closeMention, closeSlash, disabled]);

  const syncMenusFromCaret = useCallback(() => {
    const root = rootRef.current;
    if (!root || disabled) {
      closeMenus();
      return;
    }
    const mention = getComposerMentionMatch(root);
    if (mention) {
      syncMentionFromCaret();
      return;
    }
    closeMention();
    syncSlashFromCaret();
  }, [closeMenus, closeMention, disabled, syncMentionFromCaret, syncSlashFromCaret]);

  const composerKeepsMentionOpen = useCallback(() => {
    const root = rootRef.current;
    if (!root) return false;
    const active = document.activeElement;
    if (active === root) return true;
    if (active instanceof Node && root.contains(active)) return true;
    if (
      active instanceof Element
      && (active.closest(".composer-mention-menu")
        || active.closest(".composer-slash-menu"))
    ) {
      return true;
    }
    return false;
  }, []);

  const applyMentionSelection = useCallback(
    (action: PinnedAction) => {
      const root = rootRef.current;
      const range = mentionRangeRef.current;
      if (!root || !range) return;
      applyComposerMentionTag(root, range, action);
      closeMenus();
      emitChange();
    },
    [closeMenus, emitChange],
  );

  const applySlashSelection = useCallback(
    (command: { name: string }) => {
      const root = rootRef.current;
      const range = slashRangeRef.current;
      if (!root || !range) return;
      applyComposerSlashCommand(root, range, command.name);
      closeMenus();
      emitChange();
    },
    [closeMenus, emitChange],
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
        closeMenus();
        const chip = createComposerTagElement(action);
        const spacer = createComposerTagSpacer();
        insertNodeAtSelection(root, chip);
        chip.after(spacer);
        placeCaretAfterComposerTagSpacer(spacer, root);
        hydrateComposerTagIcons(root);
        emitChange();
      },
      insertBrowserElementTag: (element: BrowserElementTag) => {
        const root = rootRef.current;
        if (!root || disabled) return;
        closeMenus();
        const chip = createBrowserElementTagElement(element);
        const spacer = createComposerTagSpacer();
        insertNodeAtSelection(root, chip);
        chip.after(spacer);
        placeCaretAfterComposerTagSpacer(spacer, root);
        emitChange();
      },
      insertMentionTrigger: () => {
        const root = rootRef.current;
        if (!root || disabled) return;
        if (value !== lastEmitted.current) {
          renderMarkupIntoRoot(root, value);
          lastEmitted.current = value;
        }
        insertPlainTextWithUndo(root, "@");
        emitChange();
        root.focus({ preventScroll: true });
        requestAnimationFrame(() => syncMenusFromCaret());
      },
      insertPlainText: (text: string) => {
        const root = rootRef.current;
        if (!root || disabled || !text) return;
        if (value !== lastEmitted.current) {
          renderMarkupIntoRoot(root, value);
          lastEmitted.current = value;
        }
        closeMenus();
        insertPlainTextWithUndo(root, text);
        emitChange();
        root.focus();
      },
      beginVoiceStream: () => {
        const root = rootRef.current;
        if (!root || disabled) return;
        if (value !== lastEmitted.current) {
          renderMarkupIntoRoot(root, value);
          lastEmitted.current = value;
        }
        closeMenus();
        beginComposerVoiceStream(root);
        emitChange();
        root.focus();
      },
      updateVoiceStream: (text: string) => {
        const root = rootRef.current;
        if (!root || disabled) return;
        if (!updateComposerVoiceStream(root, text)) return;
        emitChange();
      },
      endVoiceStream: (finalText?: string) => {
        const root = rootRef.current;
        if (!root || disabled) return;
        if (!endComposerVoiceStream(root, finalText)) return;
        emitChange();
        root.focus();
      },
      cancelVoiceStream: () => {
        const root = rootRef.current;
        if (!root || disabled) return;
        if (!cancelComposerVoiceStream(root)) return;
        emitChange();
      },
      getValue: () => {
        const root = rootRef.current;
        if (!root) return lastEmitted.current;
        return serializeComposerRoot(root);
      },
    }),
    [closeMenus, disabled, emitChange, syncMenusFromCaret, value],
  );

  useEffect(() => {
    preloadComposerTagIcons();
    return subscribeFaIconCache(() => {
      const root = rootRef.current;
      if (root) hydrateComposerTagIcons(root);
    });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onSelectionChange = () => {
      if (document.activeElement !== root) return;
      syncMenusFromCaret();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [syncMenusFromCaret]);

  useEffect(() => {
    if (!tagPreview.preview) return;
    const onScroll = () => tagPreview.handleScroll();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [tagPreview.preview, tagPreview.handleScroll]);

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
    if (!slashOpen) return;
    if (slashItems.length === 0) {
      setSlashActiveIndex(0);
      return;
    }
    setSlashActiveIndex((index) =>
      index >= slashItems.length ? 0 : index,
    );
  }, [slashItems.length, slashOpen]);

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
    syncMenusFromCaret();
    emitChange();
  };

  const handleBeforeInput = (event: React.FormEvent<HTMLDivElement>) => {
    if (disabled) return;

    notifyUserEdit();

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

  const handleFocus = () => {
    requestAnimationFrame(() => syncMenusFromCaret());
  };

  const handleBlur = () => {
    const root = rootRef.current;
    tagPreview.hidePreview(true);
    window.setTimeout(() => {
      if (composerKeepsMentionOpen()) {
        syncMenusFromCaret();
        return;
      }
      closeMenus();
    }, 0);
    if (!root) return;
    if (normalizeEmptyComposerRoot(root)) {
      placeCaretAtStart(root);
      emitChange();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    notifyUserEdit();
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
    if (disabled) return;

    const root = rootRef.current;
    if (!root) return;

    const menuOpen = mentionOpen || slashOpen;
    const menuOnly =
      menuOpen
      && (event.key === "ArrowDown"
        || event.key === "ArrowUp"
        || event.key === "Enter"
        || event.key === "Tab"
        || event.key === "Escape");
    if (!menuOnly) {
      notifyUserEdit();
    }

    if (slashOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSlash();
        return;
      }
      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp")
        && slashItems.length > 0
      ) {
        event.preventDefault();
        setSlashActiveIndex((index) => {
          if (event.key === "ArrowDown") {
            return (index + 1) % slashItems.length;
          }
          return (index - 1 + slashItems.length) % slashItems.length;
        });
        return;
      }
      if (
        (event.key === "Enter" || event.key === "Tab")
        && slashItems.length > 0
      ) {
        event.preventDefault();
        applySlashSelection(slashItems[slashActiveIndex]);
        return;
      }
    }

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
    if (event.key === "Enter" && !event.shiftKey && !menuOpen) {
      event.preventDefault();
      onSubmit();
    }
  };

  const isEmpty = useMemo(() => !canSendComposedMessage(value), [value]);

  return (
    <div
      className="composer-field composer-field--markup"
      role="group"
      aria-label="消息输入"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          if (!disabled) notifyUserEdit();
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
        onMouseDown={() => {
          if (!disabled) notifyUserEdit();
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
        onCopy={handleCopy}
        onCut={handleCut}
        onKeyDown={handleKeyDown}
        onMouseOver={tagPreview.handleMouseOver}
        onMouseOut={tagPreview.handleMouseOut}
        onCompositionStart={() => {
          if (!disabled) notifyUserEdit();
        }}
      />
      <ComposerTagPreviewPopover
        open={tagPreview.preview !== null}
        anchorRect={tagPreview.preview?.anchorRect ?? null}
        model={tagPreview.preview?.model ?? null}
        onPanelHoverChange={tagPreview.handlePanelHoverChange}
      />
      <ComposerMentionMenu
        open={mentionOpen}
        query={mentionQuery ?? ""}
        anchorRect={mentionAnchorRect}
        search={mentionSearch}
        activeIndex={mentionActiveIndex}
        onSelect={applyMentionSelection}
      />
      <ComposerSlashMenu
        open={slashOpen}
        query={slashQuery ?? ""}
        anchorRect={slashAnchorRect}
        commands={slashItems}
        loading={slashCatalog.loading}
        error={slashCatalog.error}
        activeIndex={slashActiveIndex}
        onSelect={applySlashSelection}
      />
    </div>
  );
});
