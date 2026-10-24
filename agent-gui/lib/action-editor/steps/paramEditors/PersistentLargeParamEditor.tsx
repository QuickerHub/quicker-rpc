import { useCallback, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type LargeParamSlotRegistration = (key: string, node: HTMLDivElement | null, previous: HTMLDivElement | null) => void;
export function LargeParamSlot({ paramKey, register }: { paramKey: string; register: LargeParamSlotRegistration }): JSX.Element {
  const previous = useRef<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    register(paramKey, node, previous.current); previous.current = node;
  }, [paramKey, register]);
  return <div ref={ref} className="step-editor-large-param-slot" />;
}

/**
 * One stable portal container owns the existing field, CodeMirror and debounced file writes.
 * Moving this empty host between view slots never remounts the editor or creates a second draft.
 */
export function PersistentLargeParamEditor({ previewTarget, fullTarget, expanded, children }: {
  previewTarget?: HTMLDivElement; fullTarget?: HTMLDivElement; expanded: boolean; children: ReactNode;
}): JSX.Element {
  const [container] = useState(() => document.createElement("div"));
  useLayoutEffect(() => {
    container.className = expanded ? "step-editor-large-editor step-editor-large-editor--full" : "step-editor-large-editor";
    const target = expanded ? fullTarget : previewTarget ?? fullTarget;
    target?.appendChild(container);
    return () => { container.remove(); };
  }, [container, expanded, previewTarget, fullTarget]);
  return createPortal(children, container);
}
