"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import {
  buildPreviewFromTagElement,
  type ComposerTagPreviewModel,
} from "@/lib/composer-tag-preview";
import { COMPOSER_TAG_CLASS } from "@/lib/composer-inline";

export type ComposerTagPreviewState = {
  anchorRect: DOMRect;
  model: ComposerTagPreviewModel;
};

/** Delay before hide so the cursor can move from chip to the portaled panel. */
const HIDE_DELAY_MS = 160;

function tagFromEventTarget(
  root: HTMLElement | null,
  target: EventTarget | null,
): HTMLElement | null {
  if (!root || !(target instanceof Element)) return null;
  const tag = target.closest(`.${COMPOSER_TAG_CLASS}`);
  if (!(tag instanceof HTMLElement) || !root.contains(tag)) return null;
  return tag;
}

/** Hover preview for `.composer-prompt-tag` chips inside a contenteditable composer. */
export function useComposerTagPreview(rootRef: RefObject<HTMLElement | null>) {
  const [preview, setPreview] = useState<ComposerTagPreviewState | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTagRef = useRef<HTMLElement | null>(null);
  const panelHoverRef = useRef(false);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hidePreview = useCallback((force = false) => {
    if (!force && panelHoverRef.current) return;
    clearHideTimer();
    panelHoverRef.current = false;
    activeTagRef.current = null;
    setPreview(null);
  }, [clearHideTimer]);

  const showForTag = useCallback(
    (tag: HTMLElement) => {
      if (activeTagRef.current === tag) return;
      clearHideTimer();
      const model = buildPreviewFromTagElement(tag);
      if (!model) {
        hidePreview();
        return;
      }
      activeTagRef.current = tag;
      setPreview({
        anchorRect: tag.getBoundingClientRect(),
        model,
      });
    },
    [clearHideTimer, hidePreview],
  );

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(hidePreview, HIDE_DELAY_MS);
  }, [clearHideTimer, hidePreview]);

  const handleMouseOver = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const root = rootRef.current;
      const tag = tagFromEventTarget(root, event.target);
      if (!tag) return;
      if (event.relatedTarget instanceof Node && tag.contains(event.relatedTarget)) {
        return;
      }
      showForTag(tag);
    },
    [rootRef, showForTag],
  );

  const handleMouseOut = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const root = rootRef.current;
      const tag = tagFromEventTarget(root, event.target);
      if (!tag || activeTagRef.current !== tag) return;
      const next = event.relatedTarget;
      if (next instanceof Node && tag.contains(next)) return;
      scheduleHide();
    },
    [rootRef, scheduleHide],
  );

  const handleScroll = useCallback(() => {
    const tag = activeTagRef.current;
    if (!tag) return;
    setPreview((prev) => {
      if (!prev) return prev;
      return { ...prev, anchorRect: tag.getBoundingClientRect() };
    });
  }, []);

  const handlePanelHoverChange = useCallback(
    (hovering: boolean) => {
      panelHoverRef.current = hovering;
      if (hovering) {
        clearHideTimer();
        return;
      }
      scheduleHide();
    },
    [clearHideTimer, scheduleHide],
  );

  return {
    preview,
    hidePreview,
    handleMouseOver,
    handleMouseOut,
    handleScroll,
    handlePanelHoverChange,
  };
}
