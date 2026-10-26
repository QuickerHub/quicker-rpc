/** UI data only. Connection credentials and native edit sessions never cross this boundary. */
export type QuickerNativeMcpDiscovery = {
  status: "found" | "missing" | "disabled" | "invalid" | "unavailable";
  identity: string | null;
  message?: string;
};

export type QuickerNativeMcpSettingsState = {
  cwd: string;
  /** Opaque revision of this profile, workspace configuration and discovered source. */
  revision: string;
  userEnabled: boolean;
  userManaged: boolean;
  effective: {
    enabled: boolean;
    scope: "user" | "workspace" | "none";
    managed: boolean;
    blocked: boolean;
    message?: string;
  };
  discovery: QuickerNativeMcpDiscovery;
  observedAt: string;
};

export type QuickerNativeMcpProbeResult = {
  status: "ok" | "unavailable" | "unauthorized" | "consent-required" | "error" | "source_changed";
  sourceIdentity?: string;
  serverInfo?: { name: string | null; version: string | null };
  toolCount?: number;
  instructionsStatus?: "available" | "missing" | "omitted";
  checkedAt: string;
  message?: string;
};

export type QuickerNativeMcpSettingsResponse = {
  ok: boolean;
  state?: QuickerNativeMcpSettingsState;
  probe?: QuickerNativeMcpProbeResult;
  error?: { code: string; message: string };
};

export type QuickerNativeMcpSettingsRequest = {
  action: "set-enabled" | "probe";
  cwd: string;
  revision: string;
  enabled?: boolean;
};
