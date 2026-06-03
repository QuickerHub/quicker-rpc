import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX
} from "react";
import type { ActionSubProgram } from "@/lib/action-editor/types/common";
import { createDoubleClickClearFilterHandlers } from "../shared/filterInputDoubleClickClear";
import type { QuickInsertCandidate } from "./stepQuickInsertCandidates";
import { fetchStepQuickInsertSearch } from "./stepQuickInsertApi";

const SEARCH_INPUT_DEBOUNCE_MS = 50;

export type StepQuickInsertProps = {
  open: boolean;
  backendBaseUrl: string;
  subPrograms: ActionSubProgram[];
  onPick: (candidate: QuickInsertCandidate) => void;
  onCancel: () => void;
};

export type StepQuickInsertHandle = {
  /** Same as choosing the highlighted row (e.g. Enter when focus is not on the search input). */
  confirmPick: () => void;
};

export const StepQuickInsert = forwardRef<StepQuickInsertHandle, StepQuickInsertProps>(
  function StepQuickInsert({ open, backendBaseUrl, subPrograms, onPick, onCancel }, ref): JSX.Element | null {
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [items, setItems] = useState<QuickInsertCandidate[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [listLoading, setListLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const composingRef = useRef(false);
    const debounceTimerRef = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const itemsRef = useRef<QuickInsertCandidate[]>([]);
    const highlightIndexRef = useRef(0);
    const searchSeqRef = useRef(0);
    const appendLockRef = useRef(false);
    /** When true, next paint after listLoading clears from a skip=0 fetch: scroll list to top. */
    const pendingListScrollResetRef = useRef(false);
    /** Native scrollbar clicks often blur the input with relatedTarget=null; target may not be inside the root. */
    const pointerDownLikelyInsideWidgetRef = useRef(false);

    itemsRef.current = items;
    highlightIndexRef.current = highlightIndex;

    const clearSearchDebounceTimer = useCallback((): void => {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    }, []);

    const scheduleDebouncedSearch = useCallback(
      (keyword: string): void => {
        clearSearchDebounceTimer();
        debounceTimerRef.current = window.setTimeout(() => {
          debounceTimerRef.current = null;
          setDebouncedQuery(keyword);
        }, SEARCH_INPUT_DEBOUNCE_MS);
      },
      [clearSearchDebounceTimer]
    );

    const clearSearchKeyword = useCallback((): void => {
      clearSearchDebounceTimer();
      setQuery("");
      setDebouncedQuery("");
      setHighlightIndex(0);
    }, [clearSearchDebounceTimer]);

    const { onDoubleClick: onInputDoubleClickClear } = useMemo(
      () =>
        createDoubleClickClearFilterHandlers({
          getKeyword: () => query,
          clearKeyword: clearSearchKeyword
        }),
      [query, clearSearchKeyword]
    );

    useEffect(() => {
      if (!open) {
        clearSearchDebounceTimer();
        return;
      }
      if (composingRef.current) {
        return;
      }
      scheduleDebouncedSearch(query);
      return clearSearchDebounceTimer;
    }, [query, open, scheduleDebouncedSearch, clearSearchDebounceTimer]);

    useEffect(() => {
      if (!open) {
        return;
      }
      setQuery("");
      // Sync debounced keyword so first page loads immediately (avoids debounce wait on open).
      setDebouncedQuery("");
      setItems([]);
      setHasMore(false);
      setHighlightIndex(0);
      pendingListScrollResetRef.current = false;
      composingRef.current = false;
      clearSearchDebounceTimer();
      queueMicrotask(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
    }, [open, clearSearchDebounceTimer]);

    useEffect(() => {
      if (!open) {
        return;
      }
      const mySeq = ++searchSeqRef.current;
      const ac = new AbortController();
      pendingListScrollResetRef.current = true;
      setListLoading(true);
      void (async () => {
        try {
          const res = await fetchStepQuickInsertSearch(
            backendBaseUrl,
            { keyword: debouncedQuery, skip: 0, subPrograms },
            ac.signal
          );
          if (mySeq !== searchSeqRef.current) {
            return;
          }
          setItems(res.items);
          setHasMore(res.hasMore);
          setHighlightIndex(0);
        } catch {
          if (mySeq !== searchSeqRef.current) {
            return;
          }
          setItems([]);
          setHasMore(false);
          setHighlightIndex(0);
        } finally {
          if (mySeq === searchSeqRef.current) {
            setListLoading(false);
          }
        }
      })();
      return () => {
        ac.abort();
      };
    }, [open, debouncedQuery, backendBaseUrl, subPrograms]);

    useLayoutEffect(() => {
      if (!open) {
        return;
      }
      const root = rootRef.current;
      if (!root) {
        return;
      }
      root.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [open, items.length]);

    useLayoutEffect(() => {
      if (!open || items.length === 0) {
        return;
      }
      const ul = listRef.current;
      if (!ul) {
        return;
      }
      const active = ul.querySelector('[role="option"][aria-selected="true"]');
      if (active instanceof HTMLElement) {
        active.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }, [open, highlightIndex, items]);

    useLayoutEffect(() => {
      if (!open || listLoading || !pendingListScrollResetRef.current) {
        return;
      }
      pendingListScrollResetRef.current = false;
      const ul = listRef.current;
      if (ul) {
        ul.scrollTop = 0;
      }
    }, [open, listLoading, items]);

    useEffect(() => {
      if (!open) {
        return;
      }
      const onPointerDownCapture = (event: PointerEvent): void => {
        const root = rootRef.current;
        if (!root) {
          pointerDownLikelyInsideWidgetRef.current = false;
          return;
        }
        const t = event.target;
        let inside = t instanceof Node && root.contains(t);
        if (!inside && event.isPrimary) {
          const hit = document.elementFromPoint(event.clientX, event.clientY);
          inside = hit instanceof Node && root.contains(hit);
        }
        pointerDownLikelyInsideWidgetRef.current = inside;
      };
      document.addEventListener("pointerdown", onPointerDownCapture, true);
      return () => document.removeEventListener("pointerdown", onPointerDownCapture, true);
    }, [open]);

    const appendNextPage = useCallback(async (): Promise<void> => {
      if (!open || listLoading || loadingMore || !hasMore || appendLockRef.current) {
        return;
      }
      appendLockRef.current = true;
      setLoadingMore(true);
      const kw = debouncedQuery;
      const skip = itemsRef.current.length;
      const mySeq = searchSeqRef.current;
      try {
        const res = await fetchStepQuickInsertSearch(backendBaseUrl, { keyword: kw, skip, subPrograms });
        if (mySeq !== searchSeqRef.current) {
          return;
        }
        const added = res.items.length;
        setItems((prev) => [...prev, ...res.items]);
        setHasMore(res.hasMore);
        if (added > 0) {
          setHighlightIndex((hi) => Math.min(hi, skip + added - 1));
        }
      } catch {
        if (mySeq === searchSeqRef.current) {
          setHasMore(false);
        }
      } finally {
        setLoadingMore(false);
        appendLockRef.current = false;
      }
    }, [open, listLoading, loadingMore, hasMore, debouncedQuery, backendBaseUrl, subPrograms]);

    const onListScroll = useCallback(
      (e: React.UIEvent<HTMLUListElement>): void => {
        const el = e.currentTarget;
        if (listLoading || loadingMore || !hasMore) {
          return;
        }
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) {
          void appendNextPage();
        }
      },
      [appendNextPage, hasMore, listLoading, loadingMore]
    );

    const pickHighlighted = useCallback((): void => {
      const list = itemsRef.current;
      const c = list[highlightIndexRef.current];
      if (!c) {
        return;
      }
      onPick(c);
    }, [onPick]);

    useImperativeHandle(
      ref,
      () => ({
        confirmPick: (): void => {
          if (composingRef.current) {
            return;
          }
          const list = itemsRef.current;
          const idx = highlightIndexRef.current;
          const c = list[idx];
          if (!c) {
            return;
          }
          onPick(c);
        }
      }),
      [onPick]
    );

    const onInputKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          if (items.length === 0) return;
          setHighlightIndex((i) => Math.min(i + 1, items.length - 1));
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          if (items.length === 0) return;
          setHighlightIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (event.key === "Enter") {
          if (composingRef.current) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          pickHighlighted();
        }
      },
      [items.length, onCancel, pickHighlighted]
    );

    const onRootBlur = useCallback(
      (event: React.FocusEvent<HTMLDivElement>): void => {
        const rt = event.relatedTarget as Node | null;
        if (rt && event.currentTarget.contains(rt)) {
          return;
        }
        window.queueMicrotask(() => {
          const root = rootRef.current;
          const ae = document.activeElement;
          if (root && ae instanceof Node && root.contains(ae)) {
            return;
          }
          if (pointerDownLikelyInsideWidgetRef.current) {
            pointerDownLikelyInsideWidgetRef.current = false;
            inputRef.current?.focus({ preventScroll: true });
            return;
          }
          onCancel();
        });
      },
      [onCancel]
    );

    if (!open) {
      return null;
    }

    const showEmptyNoMatch = !listLoading && items.length === 0 && debouncedQuery.trim().length > 0;
    const showList = items.length > 0 || listLoading;

    return (
      <div ref={rootRef} className="step-quick-insert" role="search" onBlur={onRootBlur}>
        <input
          ref={inputRef}
          type="text"
          className="step-quick-insert-input"
          placeholder="搜索步骤或子程序…"
          title="双击清空"
          value={query}
          aria-autocomplete="list"
          aria-controls="step-quick-insert-listbox"
          aria-expanded={showList}
          onCompositionStart={() => {
            composingRef.current = true;
            // Avoid searching partial Latin/pinyin while IME session is active.
            clearSearchDebounceTimer();
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            scheduleDebouncedSearch(e.currentTarget.value);
          }}
          onChange={(e) => setQuery(e.target.value)}
          onDoubleClick={onInputDoubleClickClear}
          onKeyDown={onInputKeyDown}
        />
        {showList ? (
          <ul
            ref={listRef}
            id="step-quick-insert-listbox"
            className="step-quick-insert-list"
            role="listbox"
            aria-busy={listLoading || loadingMore}
            onScroll={onListScroll}
          >
            {listLoading && items.length === 0 ? (
              <li className="step-quick-insert-status" role="status">
                加载中…
              </li>
            ) : null}
            {items.map((c, idx) => (
              <li
                key={c.id}
                role="option"
                aria-selected={idx === highlightIndex}
                className={`step-quick-insert-option${idx === highlightIndex ? " step-quick-insert-option--active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(c);
                }}
                onMouseEnter={() => setHighlightIndex(idx)}
              >
                {c.labelHtml ? (
                  <span className="step-quick-insert-option-label" dangerouslySetInnerHTML={{ __html: c.labelHtml }} />
                ) : (
                  <span className="step-quick-insert-option-label">{c.label}</span>
                )}
                {c.description || c.descriptionHtml ? (
                  c.descriptionHtml ? (
                    <span
                      className="step-quick-insert-option-desc"
                      dangerouslySetInnerHTML={{ __html: c.descriptionHtml }}
                    />
                  ) : (
                    <span className="step-quick-insert-option-desc">{c.description}</span>
                  )
                ) : null}
              </li>
            ))}
            {loadingMore ? (
              <li className="step-quick-insert-status" role="status">
                加载更多…
              </li>
            ) : null}
          </ul>
        ) : showEmptyNoMatch ? (
          <div className="step-quick-insert-empty" role="status">
            无匹配项
          </div>
        ) : null}
      </div>
    );
  }
);
