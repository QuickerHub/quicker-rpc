"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AgentCommandCatalogItem = {
  name: string;
  description: string;
  argumentHint: string | null;
  scope: string;
};

export type AgentDefsCatalogView = {
  commands: AgentCommandCatalogItem[];
  loading: boolean;
  error: string | null;
};

const EMPTY: AgentDefsCatalogView = {
  commands: [],
  loading: false,
  error: null,
};

export function useAgentDefsCatalog(workingDirectory: string): AgentDefsCatalogView {
  const [state, setState] = useState<AgentDefsCatalogView>(EMPTY);
  const cwd = workingDirectory.trim();
  const lastCwd = useRef("");

  const refresh = useCallback(async () => {
    if (!cwd) {
      setState({ commands: [], loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const url = new URL("/api/agent-defs", window.location.origin);
      url.searchParams.set("cwd", cwd);
      const res = await fetch(url.toString());
      const data = (await res.json()) as {
        ok?: boolean;
        commands?: AgentCommandCatalogItem[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setState({
        commands: data.commands ?? [],
        loading: false,
        error: null,
      });
    } catch (e) {
      setState({
        commands: [],
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [cwd]);

  useEffect(() => {
    if (cwd === lastCwd.current) return;
    lastCwd.current = cwd;
    void refresh();
  }, [cwd, refresh]);

  return state;
}

export function filterSlashCommands(
  commands: AgentCommandCatalogItem[],
  query: string,
): AgentCommandCatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  return commands.filter(
    (c) =>
      c.name.toLowerCase().includes(q)
      || c.description.toLowerCase().includes(q),
  );
}
