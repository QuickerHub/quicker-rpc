"use client";

import type { PingState } from "@/lib/use-qkrpc-ping";
import {
  extractProtocolVersionFromPing,
  useAppVersionSnapshot,
} from "@/lib/use-app-versions";

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
  const { snapshot, agentDisplayVersion, qkrpcDisplayVersion } =
    useAppVersionSnapshot(versionRefreshKey, active);

  const agentVersion = agentDisplayVersion;
  const qkrpcVersion = qkrpcDisplayVersion;
  const protocolVersion = extractProtocolVersionFromPing(ping);
  const runtimeLabel =
    snapshot?.runtime === "bundled"
      ? "安装版"
      : snapshot?.runtime === "dev"
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
