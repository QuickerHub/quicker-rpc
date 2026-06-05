"use client";

import { useEffect, useState } from "react";
import { buildShellCombinedOutput } from "@/lib/shell-tool-view";

export type ShellSessionWatchState = {
  output: string;
  status: "idle" | "running" | "success" | "error";
  exitCode?: number;
  commandLine?: string;
  shell?: string;
};

type ShellSessionSnapshot = {
  id: string;
  commandLine: string;
  cwd?: string;
  shell?: string;
  status: "running" | "success" | "error";
  stdout: string;
  stderr: string;
  exitCode?: number;
  durationMs?: number;
  startedAt: number;
  endedAt?: number;
};

/** Poll interval while a shell session is running. */
const POLL_MS = 1_000;

function snapshotToWatchState(
  snapshot: ShellSessionSnapshot,
): ShellSessionWatchState {
  return {
    output: buildShellCombinedOutput(snapshot.stdout, snapshot.stderr),
    status: snapshot.status,
    exitCode: snapshot.exitCode,
    commandLine: snapshot.commandLine,
    shell: snapshot.shell,
  };
}

function watchStateEqual(
  a: ShellSessionWatchState,
  b: ShellSessionWatchState,
): boolean {
  return (
    a.output === b.output
    && a.status === b.status
    && a.exitCode === b.exitCode
    && a.commandLine === b.commandLine
    && a.shell === b.shell
  );
}

export function useShellSessionWatch(
  sessionId: string | undefined,
  enabled: boolean,
): ShellSessionWatchState {
  const [state, setState] = useState<ShellSessionWatchState>({
    output: "",
    status: "idle",
  });

  useEffect(() => {
    if (!enabled || !sessionId?.trim()) {
      setState({ output: "", status: "idle" });
      return;
    }

    const id = sessionId.trim();
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let lastApplied: ShellSessionWatchState | null = null;

    const stopPolling = () => {
      if (!pollTimer) return;
      clearInterval(pollTimer);
      pollTimer = null;
    };

    const applySnapshot = (snapshot: ShellSessionSnapshot) => {
      if (cancelled) return;
      const next = snapshotToWatchState(snapshot);
      if (lastApplied && watchStateEqual(lastApplied, next)) return;
      lastApplied = next;
      setState(next);
      if (next.status !== "running") stopPolling();
    };

    const pollOnce = async () => {
      try {
        const res = await fetch(
          `/api/shell/session?sessionId=${encodeURIComponent(id)}`,
        );
        if (res.status === 404) {
          stopPolling();
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          snapshot?: ShellSessionSnapshot;
        };
        if (data.ok && data.snapshot) applySnapshot(data.snapshot);
      } catch {
        /* ignore transient poll errors */
      }
    };

    void pollOnce();
    pollTimer = setInterval(() => {
      void pollOnce();
    }, POLL_MS);

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [enabled, sessionId]);

  return state;
}
