import type { MouseEvent } from "react";

export type DoubleClickClearFilterKeywordCallbacks = {
  /** Current text; trim() used to decide if there is anything to clear. */
  getKeyword: () => string;
  /** Reset controlled value (and any debounced copy / list state as needed). */
  clearKeyword: () => void;
};

/**
 * Standard filter/search UX: double-click the input to clear the keyword.
 * Use with controlled {@link HTMLInputElement} value + onChange (see {@link FilterBox}, {@link StepQuickInsert}).
 */
export function createDoubleClickClearFilterHandlers(
  callbacks: DoubleClickClearFilterKeywordCallbacks
): { onDoubleClick: (event: MouseEvent<HTMLInputElement>) => void } {
  return {
    onDoubleClick(event: MouseEvent<HTMLInputElement>): void {
      if (callbacks.getKeyword().trim().length === 0) {
        return;
      }
      event.preventDefault();
      callbacks.clearKeyword();
    }
  };
}
