"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecentActionItem } from "@/lib/recent-actions";

export type RecentActionsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; items: RecentActionItem[] }
  | { status: "error"; message: string };

export function useRecentActions(qkrpcOk: boolean, refreshKey = 0) {
  const [state, setState] = useState<RecentActionsState>({ status: "idle" });

  const reload = useCallback(async () => {
    if (!qkrpcOk) {
      setState({ status: "error", message: "未连接 Quicker" });
      return;
    }
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/actions/recent", { cache: "no-store" });
      const raw = await res.text();
      let data: unknown = null;
      if (raw.trim()) {
        try {
          data = JSON.parse(raw) as unknown;
        } catch {
          setState({ status: "error", message: "最近动作接口响应无效" });
          return;
        }
      }
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
          ? (data as { items: RecentActionItem[] }).items
          : [];
      if (res.ok && ok) {
        setState({ status: "ok", items });
        return;
      }
      const err =
        typeof data === "object"
        && data !== null
        && "error" in data
        && typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : `HTTP ${res.status}`;
      setState({ status: "error", message: err });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [qkrpcOk]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  return { state, reload };
}
