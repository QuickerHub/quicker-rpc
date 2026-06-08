"use client";

import type { RefObject } from "react";
import { useEmbeddedWebViewHostWatcher } from "@/lib/use-embedded-webview-host-watcher";

type EmbeddedWebViewBoundsWatcherProps = {
  hostRef: RefObject<HTMLElement | null>;
  enabled: boolean;
};

/** HTML host-layer observer: measures bounds and posts refresh messages to the native webview. */
export function EmbeddedWebViewBoundsWatcher({
  hostRef,
  enabled,
}: EmbeddedWebViewBoundsWatcherProps) {
  useEmbeddedWebViewHostWatcher({ hostRef, enabled });
  return null;
}
