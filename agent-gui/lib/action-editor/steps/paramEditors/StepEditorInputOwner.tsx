import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type InputSlotRegistration = (key: string, node: HTMLDivElement | null, previous: HTMLDivElement | null) => void;

export function StepEditorInputSlot({ paramKey, register }: { paramKey: string; register: InputSlotRegistration }) {
  const previous = useRef<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    register(paramKey, node, previous.current);
    previous.current = node;
  }, [paramKey, register]);
  return <div ref={ref} />;
}

/** Layout changes move the field's DOM host, preserving its draft and pending file write. */
export function StepEditorInputOwner({ target, children }: { target?: HTMLDivElement; children: ReactNode }) {
  const [container] = useState(() => typeof document === "undefined" ? null : document.createElement("div"));
  useLayoutEffect(() => {
    if (!container) return;
    target?.appendChild(container);
    return () => { container.remove(); };
  }, [container, target]);
  return container ? createPortal(children, container) : null;
}
