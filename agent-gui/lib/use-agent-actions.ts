"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecentActionItem } from "@/lib/recent-actions";

export type AgentActionsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; items: RecentActionItem[] }
  | { status: "error"; message: string };

function beginReload(prev: AgentActionsState): AgentActionsState {
  if (prev.status === "ok" || prev.status === "loading") return prev;
  return { status: "loading" };
}

/** Load assistant-scope actions via server API (direct qkrpc, no LLM). */
export function useAgentActions(enabled: boolean, refreshKey = 0) {
  const [state, setState] = useState<AgentActionsState>({ status: "idle" });

  const reload = useCallback(async () => {
    setState(beginReload);
    try {
      const res = await fetch("/api/actions/agent", { cache: "no-store" });
      const raw = await res.text();
      let data: unknown = null;
      if (raw.trim()) {
        try {
          data = JSON.parse(raw) as unknown;
        } catch {
          setState((prev) =>
            prev.status === "ok"
              ? prev
              : { status: "error", message: "助手动作接口响应无效" },
          );
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
          : res.status === 503
            ? "Quicker 未连接或 qkrpc 不可用"
            : `HTTP ${res.status}`;
      setState((prev) => (prev.status === "ok" ? prev : { status: "error", message: err }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState((prev) =>
        prev.status === "ok" ? prev : { status: "error", message },
      );
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload, refreshKey]);

  return { state, reload };
}
