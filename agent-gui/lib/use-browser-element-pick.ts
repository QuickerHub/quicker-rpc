"use client";

import { useCallback, useState } from "react";
import { createBrowserElementTag } from "@/lib/browser-element-tag";
import { postBrowserPanelAction } from "@/lib/browser-panel-client";
import { chatComposerActionsRef } from "@/lib/chat-composer-bridge";

function readPickField(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readPickNumber(data: Record<string, unknown>, key: string): number | null {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function useBrowserElementPick(sessionId: string) {
  const [pickMode, setPickMode] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const togglePickMode = useCallback(() => {
    setPickMode((prev) => !prev);
    setPickError(null);
  }, []);

  const pickAt = useCallback(
    async (x: number, y: number) => {
      if (picking) return;
      setPicking(true);
      setPickError(null);
      try {
        const result = await postBrowserPanelAction({
          action: "pick_element",
          sessionId,
          x,
          y,
        });
        if (!result.ok) {
          setPickError(result.message ?? "元素识别失败");
          return;
        }
        const data = result.data ?? {};
        const pickX = readPickNumber(data, "pickX") ?? x;
        const pickY = readPickNumber(data, "pickY") ?? y;
        const url = readPickField(data, "url");
        if (!url) {
          setPickError("元素识别失败：缺少页面 URL");
          return;
        }

        const elementTag = createBrowserElementTag({
          url,
          title: readPickField(data, "title"),
          pickX,
          pickY,
          ref: readPickField(data, "ref"),
          refRole: readPickField(data, "refRole"),
          refName: readPickField(data, "refName"),
          tagName: readPickField(data, "tagName"),
          text: readPickField(data, "text"),
          elementId: readPickField(data, "elementId"),
          className: readPickField(data, "className"),
          href: readPickField(data, "href"),
          value: readPickField(data, "value"),
          snapshotLine: readPickField(data, "snapshotLine"),
          sessionId,
        });

        chatComposerActionsRef.current.insertBrowserElementTag(elementTag);
        chatComposerActionsRef.current.focusComposer();
        setPickMode(false);
      } finally {
        setPicking(false);
      }
    },
    [picking, sessionId],
  );

  return {
    pickMode,
    picking,
    pickError,
    togglePickMode,
    pickAt,
    clearPickError: () => setPickError(null),
  };
}
