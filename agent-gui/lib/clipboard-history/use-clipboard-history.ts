"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearClipboardItems,
  copyClipboardItem,
  deleteClipboardItem,
  fetchClipboardRuntimeHealth,
  patchClipboardItem,
  searchClipboardItems,
  subscribeClipboardEvents,
} from "@/lib/clipboard-history/clipboard-history-client";
import { resolveClipboardHttpPort } from "@/lib/clipboard-history/clipboard-history-config";
import {
  ensureClipboardRuntimeReady,
  fetchTauriClipboardPluginStatus,
} from "@/lib/clipboard-history/clipboard-history-tauri";
import type {
  ClipItemDto,
  ClipKind,
  ClipboardPluginStatusDto,
} from "@/lib/clipboard-history/clipboard-history-types";

export type ClipboardFilterKind = ClipKind | "all" | "pinned";

export function useClipboardHistory(active: boolean) {
  const [runtimeOnline, setRuntimeOnline] = useState(false);
  const [hostStatus, setHostStatus] = useState<ClipboardPluginStatusDto | null>(null);
  const [items, setItems] = useState<ClipItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [filterKind, setFilterKind] = useState<ClipboardFilterKind>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const httpPort = useMemo(() => {
    if (hostStatus?.httpPort && hostStatus.httpPort > 0) {
      return hostStatus.httpPort;
    }
    return resolveClipboardHttpPort();
  }, [hostStatus?.httpPort]);

  const refreshRuntime = useCallback(async () => {
    const host = await fetchTauriClipboardPluginStatus();
    setHostStatus(host);
    const port = host?.httpPort && host.httpPort > 0 ? host.httpPort : resolveClipboardHttpPort();
    const health = await fetchClipboardRuntimeHealth(port);
    setRuntimeOnline(health.ok && health.ready);
    return health.ok && health.ready;
  }, []);

  const loadItems = useCallback(async () => {
    if (!runtimeOnline) return;
    setLoading(true);
    setError(null);
    try {
      const page = await searchClipboardItems(
        {
          query,
          kind: filterKind === "all" || filterKind === "pinned" ? undefined : filterKind,
          pinnedOnly: filterKind === "pinned" ? true : undefined,
          take: 200,
        },
        httpPort,
      );
      setItems(page.items);
      setTotal(page.total);
      if (page.items.length === 0) {
        setSelectedId(null);
      } else if (!selectedId || !page.items.some((item) => item.id === selectedId)) {
        setSelectedId(page.items[0]?.id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载剪贴板历史失败");
    } finally {
      setLoading(false);
    }
  }, [runtimeOnline, query, filterKind, httpPort, selectedId]);

  useEffect(() => {
    if (!active) return;
    void refreshRuntime();
  }, [active, refreshRuntime]);

  useEffect(() => {
    if (!active || !runtimeOnline) return;
    void loadItems();
  }, [active, runtimeOnline, loadItems]);

  useEffect(() => {
    if (!active || !runtimeOnline) return;
    return subscribeClipboardEvents(() => {
      void loadItems();
    }, httpPort);
  }, [active, runtimeOnline, httpPort, loadItems]);

  const startRuntime = useCallback(async () => {
    setError(null);
    const dto = await ensureClipboardRuntimeReady();
    if (dto) setHostStatus(dto);
    await refreshRuntime();
  }, [refreshRuntime]);

  const handleCopy = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await copyClipboardItem(id, httpPort);
        await loadItems();
      } catch (err) {
        setError(err instanceof Error ? err.message : "复制失败");
      } finally {
        setBusyId(null);
      }
    },
    [httpPort, loadItems],
  );

  const handleTogglePin = useCallback(
    async (item: ClipItemDto) => {
      setBusyId(item.id);
      try {
        await patchClipboardItem(item.id, { isPinned: !item.isPinned }, httpPort);
        await loadItems();
      } catch (err) {
        setError(err instanceof Error ? err.message : "置顶失败");
      } finally {
        setBusyId(null);
      }
    },
    [httpPort, loadItems],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await deleteClipboardItem(id, httpPort);
        await loadItems();
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除失败");
      } finally {
        setBusyId(null);
      }
    },
    [httpPort, loadItems],
  );

  const handleClear = useCallback(async () => {
    setBusyId("__clear__");
    try {
      await clearClipboardItems(true, httpPort);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "清空失败");
    } finally {
      setBusyId(null);
    }
  }, [httpPort, loadItems]);

  return {
    runtimeOnline,
    hostStatus,
    items,
    total,
    query,
    setQuery,
    filterKind,
    setFilterKind,
    loading,
    error,
    selectedId,
    setSelectedId,
    busyId,
    httpPort,
    refreshRuntime,
    startRuntime,
    loadItems,
    handleCopy,
    handleTogglePin,
    handleDelete,
    handleClear,
  };
}
