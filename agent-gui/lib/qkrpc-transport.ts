import { fetchQkrpcHealth, isHttpConfigured } from "@/lib/qkrpc-http";

const PROBE_CACHE_MS = 5_000;

let probeCache: { useHttp: boolean; expiresAt: number } | null = null;

function transportMode(): string {
  return (process.env.QKRPC_TRANSPORT ?? "").trim().toLowerCase();
}

/** User forced CLI subprocess only. */
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
 * Prefer qkrpc serve when configured or when GET /health on 127.0.0.1:9477 succeeds.
 * Otherwise use CLI spawn (works after build.ps1 -t without serve).
 */
export async function shouldUseHttpTransport(): Promise<boolean> {
  if (isCliTransportForced()) {
    return false;
  }
  if (isHttpTransportForced()) {
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
