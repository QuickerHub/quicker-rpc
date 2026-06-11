"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ComposerTagPreviewPopover } from "@/components/chat/ComposerTagPreviewPopover";
import type { ComposerTagPreviewModel } from "@/lib/composer-tag-preview";

type ComposerTagPreviewTriggerProps = {
  model: ComposerTagPreviewModel;
  className?: string;
  children: ReactNode;
};

const HIDE_DELAY_MS = 160;

/** Wraps a sent-message tag chip with hover preview (React tree). */
export function ComposerTagPreviewTrigger({
  model,
  className,
  children,
}: ComposerTagPreviewTriggerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelHoverRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    if (panelHoverRef.current) return;
    clearHideTimer();
    setOpen(false);
  }, [clearHideTimer]);

  const scheduleClose = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(close, HIDE_DELAY_MS);
  }, [clearHideTimer, close]);

  const refreshRect = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setAnchorRect(el.getBoundingClientRect());
  }, []);

  const handleEnter = useCallback(() => {
    clearHideTimer();
    refreshRect();
    setOpen(true);
  }, [clearHideTimer, refreshRect]);

  const handleLeave = useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);

  const handlePanelHoverChange = useCallback(
    (hovering: boolean) => {
      panelHoverRef.current = hovering;
      if (hovering) {
        clearHideTimer();
        return;
      }
      scheduleClose();
    },
    [clearHideTimer, scheduleClose],
  );

  return (
    <>
      <span
        ref={ref}
        className={
          className
            ? `${className} composer-prompt-tag--previewable`
            : "composer-prompt-tag--previewable"
        }
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {children}
      </span>
      <ComposerTagPreviewPopover
        open={open}
        anchorRect={anchorRect}
        model={model}
        onPanelHoverChange={handlePanelHoverChange}
      />
    </>
  );
}
