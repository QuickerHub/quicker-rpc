import { createContext, useContext, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type InputSlotRegistration = (key: string, node: HTMLDivElement | null, previous: HTMLDivElement | null) => void;
export const StepEditorInputActivity = createContext(true);
export function useStepEditorInputActive() { return useContext(StepEditorInputActivity); }
export function useStepEditorInputActivityRef() {
  const active = useStepEditorInputActive();
  const ref = useRef(active);
  ref.current = active;
  useLayoutEffect(() => {
    ref.current = active;
    return () => { ref.current = false; };
  }, [active]);
  return ref;
}

/** Park a field's nested dialog outside the document while its editor is inactive. */
export function useStepEditorDialogTarget(enabled: boolean) {
  const active = useStepEditorInputActive();
  const [target] = useState(() => typeof document === "undefined" ? null : document.createElement("div"));
  useLayoutEffect(() => {
    if (active && enabled && target) document.body.appendChild(target);
    return () => { target?.remove(); };
  }, [active, enabled, target]);
  return target;
}

export function StepEditorInputSlot({ paramKey, register }: { paramKey: string; register: InputSlotRegistration }) {
  const previous = useRef<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    register(paramKey, node, previous.current);
    previous.current = node;
  }, [paramKey, register]);
  return <div ref={ref} />;
}

/** Layout changes move the field's DOM host, preserving its draft and pending file write. */
export function StepEditorInputOwner({ target, className, children }: { target?: HTMLDivElement; className?: string; children: ReactNode }) {
  const [container] = useState(() => typeof document === "undefined" ? null : document.createElement("div"));
  useLayoutEffect(() => {
    if (!container) return;
    container.className = className ?? "";
    target?.appendChild(container);
    return () => { container.remove(); };
  }, [container, target, className]);
  return container ? createPortal(children, container) : null;
}
