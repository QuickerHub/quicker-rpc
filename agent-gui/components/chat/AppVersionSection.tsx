"use client";

import { useEffect, useState } from "react";
import { formatDisplayVersion } from "@/lib/app-version-format";
import type { PingState } from "@/lib/use-qkrpc-ping";
import { isTauriShell } from "@/lib/tauri-shell";

type VersionPayload = {
  quickerAgent: string;
  qkrpc: string | null;
  runtime: "bundled" | "dev";
};

function extractProtocolVersion(ping: PingState): string | null {
  if (ping.status !== "ok") return null;
  const envelope = ping.data as Record<string, unknown> | null;
  if (!envelope || typeof envelope !== "object") return null;
  const inner = envelope.data;
  if (typeof inner !== "object" || inner === null) return null;
  const version = (inner as { protocolVersion?: unknown }).protocolVersion;
  if (version === undefined || version === null) return null;
  return String(version);
}

type VersionRowProps = {
  label: string;
  value: string;
  mono?: boolean;
};

function VersionRow({ label, value, mono = true }: VersionRowProps) {
  return (
    <div className="app-settings-version-item">
      <span className="app-settings-version-label">{label}</span>
      <span
        className={[
          "app-settings-version-value",
          mono ? "app-settings-version-value--mono" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

type AppVersionSectionProps = {
  active: boolean;
  ping: PingState;
  /** Bumps when qkrpc connectivity is re-checked; triggers version re-fetch. */
  versionRefreshKey?: number;
};

export function AppVersionSection({
  active,
  ping,
  versionRefreshKey = 0,
}: AppVersionSectionProps) {
  const [payload, setPayload] = useState<VersionPayload | null>(null);
  const [tauriVersion, setTauriVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    if (!isTauriShell()) return;
    void (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const version = formatDisplayVersion((await getVersion()).trim());
        if (version) setTauriVersion(version);
      } catch {
        // Browser dev or plugin unavailable.
      }
    })();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/settings/version?t=${versionRefreshKey}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        setPayload((await res.json()) as VersionPayload);
      } catch {
        // Ignore fetch errors while tab is closing.
      }
    })();
    return () => controller.abort();
  }, [active, versionRefreshKey]);

  const agentVersion = tauriVersion ?? payload?.quickerAgent ?? "…";
  const qkrpcVersion = payload?.qkrpc ?? "…";
  const protocolVersion = extractProtocolVersion(ping);
  const runtimeLabel =
    payload?.runtime === "bundled"
      ? "安装版"
      : payload?.runtime === "dev"
        ? "开发版"
        : "…";

  return (
    <section className="app-settings-section-block app-settings-section-block--compact">
      <header className="app-settings-section-head app-settings-section-head--inline">
        <h2 className="app-settings-section-title">版本信息</h2>
      </header>
      <div className="app-settings-version-grid">
        <VersionRow label="QuickerAgent" value={agentVersion} />
        <VersionRow label="qkrpc CLI" value={qkrpcVersion} />
        <VersionRow
          label="RPC 协议"
          value={protocolVersion ?? (ping.status === "loading" ? "…" : "—")}
        />
        <VersionRow label="运行环境" value={runtimeLabel} mono={false} />
      </div>
    </section>
  );
}
