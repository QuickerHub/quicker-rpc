"use client";

import { useEffect, useState } from "react";
import type { ActionMetadataSnapshot } from "@/lib/action-metadata-api";

export type ActionMetadataState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; meta: ActionMetadataSnapshot }
  | { status: "error"; message: string };

const cache = new Map<string, ActionMetadataSnapshot>();
const inflight = new Map<string, Promise<ActionMetadataSnapshot | null>>();

async function fetchActionMetadata(
  actionId: string,
): Promise<ActionMetadataSnapshot | null> {
  const cached = cache.get(actionId);
  if (cached) return cached;

  const pending = inflight.get(actionId);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const res = await fetch(
        `/api/actions/metadata?id=${encodeURIComponent(actionId)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        meta?: ActionMetadataSnapshot;
      };
      if (!res.ok || !data.ok || !data.meta) {
        return null;
      }
      cache.set(actionId, data.meta);
      return data.meta;
    } catch {
      return null;
    } finally {
      inflight.delete(actionId);
    }
  })();

  inflight.set(actionId, promise);
  return promise;
}

/** Load action title/icon via qkrpc metadata (cached per session). */
export function useActionMetadata(actionId: string): ActionMetadataState {
  const id = actionId.trim().toLowerCase();
  const [state, setState] = useState<ActionMetadataState>(() =>
    cache.has(id) ? { status: "ok", meta: cache.get(id)! } : { status: "idle" },
  );

  useEffect(() => {
    if (!id) {
      setState({ status: "error", message: "缺少动作 id" });
      return;
    }

    const cached = cache.get(id);
    if (cached) {
      setState({ status: "ok", meta: cached });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void fetchActionMetadata(id).then((meta) => {
      if (cancelled) return;
      if (meta) {
        setState({ status: "ok", meta });
      } else {
        setState({
          status: "error",
          message: "无法加载动作信息（Quicker 未连接或动作不存在）",
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}
