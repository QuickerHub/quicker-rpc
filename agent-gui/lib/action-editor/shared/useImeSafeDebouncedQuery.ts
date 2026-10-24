import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
  type InputHTMLAttributes,
} from "react";

// Adapted from Quicker.Headless/Web/src/features/shared at 574556d76b0b10bd9a8a7951277435649650fab8.

/** True when this change event is mid-IME composition (do not filter/search yet). */
export function isImeInputChange(event: ChangeEvent<HTMLInputElement>): boolean {
  const native = event.nativeEvent;
  return native instanceof InputEvent && native.isComposing;
}

export type ImeSafeDebouncedQuery = {
  /** Bound to the input (updates during IME composition). */
  value: string;
  /** Use for search/filter — updates only after composition ends (+ optional debounce). */
  committedValue: string;
  reset: (next?: string) => void;
  inputProps: Pick<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "onCompositionStart" | "onCompositionEnd"
  >;
};

/**
 * Search/filter input state that ignores interim IME composition updates.
 * Prefer this (or {@link FilterBox}) for any keyword box that drives list filtering.
 */
export function useImeSafeDebouncedQuery(debounceMs = 0): ImeSafeDebouncedQuery {
  const [value, setValue] = useState("");
  const [committedValue, setCommittedValue] = useState("");
  const composingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback((): void => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  useEffect(() => clearTimer, [clearTimer]);

  const scheduleCommit = useCallback(
    (next: string): void => {
      clearTimer();
      if (debounceMs <= 0) {
        setCommittedValue(next);
        return;
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setCommittedValue(next);
      }, debounceMs);
    },
    [clearTimer, debounceMs],
  );

  const reset = useCallback(
    (next = ""): void => {
      clearTimer();
      composingRef.current = false;
      setValue(next);
      setCommittedValue(next);
    },
    [clearTimer],
  );

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const next = event.target.value;
      setValue(next);
      if (composingRef.current || isImeInputChange(event)) {
        return;
      }
      scheduleCommit(next);
    },
    [scheduleCommit],
  );

  const onCompositionStart = useCallback((): void => {
    composingRef.current = true;
    clearTimer();
  }, [clearTimer]);

  const onCompositionEnd = useCallback(
    (event: CompositionEvent<HTMLInputElement>): void => {
      composingRef.current = false;
      const next = event.currentTarget.value;
      setValue(next);
      scheduleCommit(next);
    },
    [scheduleCommit],
  );

  return {
    value,
    committedValue,
    reset,
    inputProps: {
      value,
      onChange,
      onCompositionStart,
      onCompositionEnd,
    },
  };
}
