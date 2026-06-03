"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  ensureFaIconsResolved,
  getFaIconFromCache,
  subscribeFaIconCache,
} from "@/lib/fa-icon-cache";
import { isFaIconSpec } from "@/lib/fa-icon";

function readGeometry(spec: string | undefined): ReturnType<typeof getFaIconFromCache> {
  const key = spec?.trim();
  if (!key || !isFaIconSpec(key)) return undefined;
  return getFaIconFromCache(key);
}

/** Cached FA icon geometry; triggers a single batched resolve when missing. */
export function useFaIconGeometry(spec: string | undefined) {
  const key = spec?.trim();

  useEffect(() => {
    if (key && isFaIconSpec(key)) ensureFaIconsResolved([key]);
  }, [key]);

  return useSyncExternalStore(
    subscribeFaIconCache,
    () => readGeometry(spec),
    () => undefined,
  );
}
