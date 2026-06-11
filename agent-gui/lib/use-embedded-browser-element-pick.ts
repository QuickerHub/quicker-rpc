"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserElementTag } from "@/lib/browser-element-tag";
import { chatComposerActionsRef } from "@/lib/chat-composer-bridge";
import {
  embeddedBrowserCancelPick,
  embeddedBrowserPickElement,
} from "@/lib/embedded-browser-tauri";

/**
 * Element picker for the native Electron embedded browser: injects the
 * in-page picker, waits for a click, then inserts the picked element as a
 * chip into the chat composer.
 */
export function useEmbeddedBrowserElementPick(browserId: string) {
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const pickingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pickingRef.current) {
        void embeddedBrowserCancelPick(browserId).catch(() => {});
      }
    };
  }, [browserId]);

  const togglePick = useCallback(async () => {
    if (pickingRef.current) {
      pickingRef.current = false;
      setPicking(false);
      void embeddedBrowserCancelPick(browserId).catch(() => {});
      return;
    }

    pickingRef.current = true;
    setPicking(true);
    setPickError(null);
    try {
      const picked = await embeddedBrowserPickElement(browserId);
      if (!picked) return;

      const elementTag = createBrowserElementTag({
        url: picked.url,
        title: picked.title,
        pickX: picked.pickX,
        pickY: picked.pickY,
        tagName: picked.tagName,
        text: picked.text,
        elementId: picked.elementId,
        className: picked.className,
        href: picked.href,
        value: picked.value,
        domPath: picked.domPath,
        reactComponent: picked.reactComponent,
        outerHtml: picked.outerHtml,
        rectTop: picked.rectTop,
        rectLeft: picked.rectLeft,
        rectWidth: picked.rectWidth,
        rectHeight: picked.rectHeight,
      });
      chatComposerActionsRef.current.insertBrowserElementTag(elementTag);
      chatComposerActionsRef.current.focusComposer();
    } catch (err) {
      const message = err instanceof Error ? err.message : "元素选取失败";
      setPickError(message);
    } finally {
      pickingRef.current = false;
      setPicking(false);
    }
  }, [browserId]);

  return {
    picking,
    pickError,
    togglePick,
    clearPickError: useCallback(() => setPickError(null), []),
  };
}
