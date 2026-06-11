"use client";

import { useEffect, useState } from "react";
import type { AppVersionSnapshot } from "@/lib/app-version";
import { formatDisplayVersion } from "@/lib/app-version-format";
import type { PingState } from "@/lib/use-qkrpc-ping";
import { getDesktopAppVersion } from "@/lib/desktop-app-version";
import { isDesktopShell } from "@/lib/desktop-shell";

export function extractProtocolVersionFromPing(ping: PingState): string | null {
  if (ping.status !== "ok") return null;
  const envelope = ping.data as Record<string, unknown> | null;
  if (!envelope || typeof envelope !== "object") return null;
  const inner = envelope.data;
  if (typeof inner !== "object" || inner === null) return null;
  const version = (inner as { protocolVersion?: unknown }).protocolVersion;
  if (version === undefined || version === null) return null;
  return String(version);
}

/** Agent-gui + qkrpc CLI versions from /api/settings/version (and Tauri when bundled). */
export function useAppVersionSnapshot(
  refreshKey = 0,
  enabled = true,
): {
  snapshot: AppVersionSnapshot | null;
  agentDisplayVersion: string;
  qkrpcDisplayVersion: string;
} {
  const [snapshot, setSnapshot] = useState<AppVersionSnapshot | null>(null);
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopShell()) return;
    void (async () => {
      try {
        const version = formatDisplayVersion(await getDesktopAppVersion());
        if (version) setDesktopVersion(version);
      } catch {
        // Browser dev or desktop invoke unavailable.
      }
    })();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/settings/version?t=${refreshKey}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        setSnapshot((await res.json()) as AppVersionSnapshot);
      } catch {
        // Ignore fetch errors.
      }
    })();
    return () => controller.abort();
  }, [enabled, refreshKey]);

  const agentDisplayVersion = desktopVersion ?? snapshot?.quickerAgent ?? "…";
  const qkrpcDisplayVersion = snapshot?.qkrpc ?? "…";

  return { snapshot, agentDisplayVersion, qkrpcDisplayVersion };
}
