import { isBundledAgentRuntime } from "@/lib/default-working-directory";
import { fetchQkrpcHealth, isHttpConfigured } from "@/lib/qkrpc-http";

const PROBE_CACHE_MS = 5_000;

let probeCache: { useHttp: boolean; expiresAt: number } | null = null;

function transportMode(): string {
  return (process.env.QKRPC_TRANSPORT ?? "").trim().toLowerCase();
}

/** User forced CLI subprocess only (debug). */
export function isCliTransportForced(): boolean {
  const mode = transportMode();
  return mode === "cli" || mode === "spawn";
}

/** User forced HTTP (QKRPC_HTTP_URL or QKRPC_TRANSPORT=http|serve). */
export function isHttpTransportForced(): boolean {
  const mode = transportMode();
  return (
    mode === "http"
    || mode === "serve"
    || isHttpConfigured()
    || process.env.QKRPC_USE_HTTP === "1"
  );
}

export function invalidateServeProbeCache(): void {
  probeCache = null;
}

/**
 * Agent-gui invokes Quicker only via qkrpc serve (HTTP).
 * Set QKRPC_TRANSPORT=cli to allow per-call qkrpc.exe spawn (local debug only).
 */
export function mustNotSpawnCli(): boolean {
  return !isCliTransportForced();
}

/** @deprecated Prefer mustNotSpawnCli — bundled/Tauri always serve-only. */
export function isServeOnlyTransport(): boolean {
  return mustNotSpawnCli();
}

/**
 * Whether to attempt HTTP before invoke (always true unless CLI forced).
 * Kept for health-probe caching used by UI status.
 */
export async function shouldUseHttpTransport(): Promise<boolean> {
  if (isCliTransportForced()) {
    return false;
  }
  if (isHttpTransportForced() || isBundledAgentRuntime()) {
    return true;
  }

  const now = Date.now();
  if (probeCache && probeCache.expiresAt > now) {
    return probeCache.useHttp;
  }

  const health = await fetchQkrpcHealth({ timeoutMs: 2_000 });
  const useHttp = health?.ok === true;
  probeCache = { useHttp, expiresAt: now + PROBE_CACHE_MS };
  return useHttp;
}
