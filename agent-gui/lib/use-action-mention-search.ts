"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionMentionItem } from "@/lib/action-mention-items";

export type MentionSearchView = {
  items: ActionMentionItem[];
  isRefreshing: boolean;
  error: string | null;
};

const DEBOUNCE_MS = 200;

const mentionCache = new Map<string, ActionMentionItem[]>();

function cacheKey(query: string): string {
  return query.trim();
}

export function useActionMentionSearch(query: string | null): MentionSearchView {
  const [view, setView] = useState<MentionSearchView>({
    items: [],
    isRefreshing: false,
    error: null,
  });
  const requestId = useRef(0);
  const activeQueryRef = useRef<string | null>(null);

  const reload = useCallback(
    async (activeQuery: string) => {
      activeQueryRef.current = activeQuery;

      const key = cacheKey(activeQuery);
      if (!mentionCache.has(key)) {
        setView((prev) => ({
          items: prev.items,
          isRefreshing: true,
          error: null,
        }));
      }

      const id = requestId.current + 1;
      requestId.current = id;

      try {
        const params = new URLSearchParams({ limit: "8" });
        if (activeQuery) params.set("q", activeQuery);
        const res = await fetch(`/api/actions/mention-search?${params.toString()}`, {
          cache: "no-store",
        });
        const raw = await res.text();
        let data: unknown = null;
        if (raw.trim()) {
          try {
            data = JSON.parse(raw) as unknown;
          } catch {
            if (requestId.current !== id) return;
            setView((prev) => ({
              items: prev.items,
              isRefreshing: false,
              error: "搜索接口响应无效",
            }));
            return;
          }
        }

        if (requestId.current !== id) return;
        if (activeQueryRef.current !== activeQuery) return;

        const ok =
          typeof data === "object"
          && data !== null
          && "ok" in data
          && (data as { ok: boolean }).ok;
        const items =
          typeof data === "object"
          && data !== null
          && "items" in data
          && Array.isArray((data as { items: unknown }).items)
            ? (data as { items: ActionMentionItem[] }).items
            : [];

        if (res.ok && ok) {
          mentionCache.set(key, items);
          setView({ items, isRefreshing: false, error: null });
          return;
        }

        const err =
          typeof data === "object"
          && data !== null
          && "error" in data
          && typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `HTTP ${res.status}`;
        setView((prev) => ({
          items: prev.items,
          isRefreshing: false,
          error: err,
        }));
      } catch (e) {
        if (requestId.current !== id) return;
        if (activeQueryRef.current !== activeQuery) return;
        setView((prev) => ({
          items: prev.items,
          isRefreshing: false,
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    },
    [],
  );

  useEffect(() => {
    if (query === null) {
      requestId.current += 1;
      activeQueryRef.current = null;
      setView({ items: [], isRefreshing: false, error: null });
      return;
    }

    const key = cacheKey(query);
    const cached = mentionCache.get(key);
    if (cached) {
      setView({ items: cached, isRefreshing: false, error: null });
    }

    const delay = query.length > 0 ? DEBOUNCE_MS : 0;
    const timer = window.setTimeout(() => {
      void reload(query);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [query, reload]);

  return view;
}

/** @internal Test helper */
export function clearMentionSearchCacheForTests(): void {
  mentionCache.clear();
}
