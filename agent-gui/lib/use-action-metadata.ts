"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionMetadataSnapshot } from "@/lib/action-metadata-api";
import {
  fetchWorkspaceActionMetadata,
  findActionMetadataInExplorerTree,
} from "@/lib/action-workspace-metadata";
import { subscribeActionExplorerTreeWatch } from "@/lib/workspace-explorer-api";

export type ActionMetadataState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; meta: ActionMetadataSnapshot }
  | { status: "error"; message: string };

const qkrpcCache = new Map<string, ActionMetadataSnapshot>();
const qkrpcInflight = new Map<string, Promise<ActionMetadataSnapshot | null>>();

async function fetchQkrpcActionMetadata(
  actionId: string,
): Promise<ActionMetadataSnapshot | null> {
  const cached = qkrpcCache.get(actionId);
  if (cached) return cached;

  const pending = qkrpcInflight.get(actionId);
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
      qkrpcCache.set(actionId, data.meta);
      return data.meta;
    } catch {
      return null;
    } finally {
      qkrpcInflight.delete(actionId);
    }
  })();

  qkrpcInflight.set(actionId, promise);
  return promise;
}

async function loadActionMetadata(
  actionId: string,
  cwd?: string,
): Promise<ActionMetadataSnapshot | null> {
  const trimmedCwd = cwd?.trim() ?? "";
  if (trimmedCwd) {
    const workspaceMeta = await fetchWorkspaceActionMetadata(trimmedCwd, actionId);
    if (workspaceMeta) return workspaceMeta;
  }
  return fetchQkrpcActionMetadata(actionId);
}

function metadataEquals(
  a: ActionMetadataSnapshot,
  b: ActionMetadataSnapshot,
): boolean {
  return (
    a.id === b.id
    && a.title === b.title
    && a.description === b.description
    && a.icon === b.icon
    && a.editVersion === b.editVersion
  );
}

/**
 * Load action title/icon/description from workspace info.json when available;
 * falls back to qkrpc metadata. Re-fetches when .quicker/actions info.json changes.
 */
export function useActionMetadata(
  actionId: string,
  cwd?: string,
): ActionMetadataState {
  const id = actionId.trim().toLowerCase();
  const workspaceCwd = cwd?.trim() ?? "";
  const [state, setState] = useState<ActionMetadataState>({ status: "idle" });
  const latestMetaRef = useRef<ActionMetadataSnapshot | null>(null);

  const applyMeta = useCallback((meta: ActionMetadataSnapshot | null) => {
    if (!meta) {
      setState({
        status: "error",
        message: "无法加载动作信息（工作区 info.json 或 Quicker 元数据不可用）",
      });
      latestMetaRef.current = null;
      return;
    }
    if (
      latestMetaRef.current
      && metadataEquals(latestMetaRef.current, meta)
    ) {
      return;
    }
    latestMetaRef.current = meta;
    setState({ status: "ok", meta });
  }, []);

  const reload = useCallback(async () => {
    if (!id) return;
    const meta = await loadActionMetadata(id, workspaceCwd || undefined);
    applyMeta(meta);
  }, [applyMeta, id, workspaceCwd]);

  useEffect(() => {
    if (!id) {
      setState({ status: "error", message: "缺少动作 id" });
      return;
    }

    let cancelled = false;
    latestMetaRef.current = null;
    setState({ status: "loading" });

    void loadActionMetadata(id, workspaceCwd || undefined).then((meta) => {
      if (cancelled) return;
      applyMeta(meta);
    });

    return () => {
      cancelled = true;
    };
  }, [applyMeta, id, workspaceCwd]);

  useEffect(() => {
    if (!id || !workspaceCwd) return;

    const unsubscribe = subscribeActionExplorerTreeWatch(workspaceCwd, {
      onTree: (tree) => {
        const fromTree = findActionMetadataInExplorerTree(tree, id);
        if (fromTree) {
          applyMeta(fromTree);
          return;
        }
        void reload();
      },
      onError: () => {
        /* keep last good metadata; watch reconnects automatically */
      },
    });

    return unsubscribe;
  }, [applyMeta, id, reload, workspaceCwd]);

  return state;
}
