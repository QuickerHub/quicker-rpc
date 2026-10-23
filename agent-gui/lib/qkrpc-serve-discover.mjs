function normalizeBase(url) {
  return url.replace(/\/$/, "");
}

function preferredPort() {
  const raw =
    process.env.QKRPC_PORT?.trim()
    ?? process.env.AGENT_GUI_QKRPC_PORT?.trim();
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 9477;
}

/** @param {string} base @param {number} [timeoutMs] @param {AbortSignal} [abortSignal] */
export async function isQkrpcServeHealthy(base, timeoutMs = 1_500, abortSignal) {
  abortSignal?.throwIfAborted();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${normalizeBase(base)}/health`, {
      method: "GET",
      signal: abortSignal ? AbortSignal.any([abortSignal, controller.signal]) : controller.signal,
      cache: "no-store",
    });
    abortSignal?.throwIfAborted();
    if (res.status !== 200 && res.status !== 503) return false;
    const body = await res.json();
    abortSignal?.throwIfAborted();
    return body?.service === "qkrpc" && typeof body?.ok === "boolean";
  } catch {
    abortSignal?.throwIfAborted();
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Find a healthy qkrpc serve on localhost and align QKRPC_HTTP_URL.
 * @param {string} [host]
 * @param {number} [scanFromPort]
 * @param {number} [maxPorts]
 * @param {AbortSignal} [abortSignal]
 * @returns {Promise<{ baseUrl: string, port: number } | null>}
 */
export async function discoverHealthyQkrpcServe(
  host = "127.0.0.1",
  scanFromPort = preferredPort(),
  maxPorts = 32,
  abortSignal,
) {
  abortSignal?.throwIfAborted();
  /** @type {string[]} */
  const candidates = [];

  const configured =
    process.env.QKRPC_HTTP_URL?.trim()
    ?? process.env.QKRPC_HTTP?.trim();
  if (configured) {
    const baseUrl = normalizeBase(configured);
    if (await isQkrpcServeHealthy(baseUrl, undefined, abortSignal)) {
      const port = Number(new URL(baseUrl).port) || 9477;
      return { baseUrl, port };
    }
    candidates.push(baseUrl);
  }

  const basePort =
    Number.isFinite(scanFromPort) && scanFromPort > 0 ? scanFromPort : 9477;
  for (let offset = 0; offset < maxPorts; offset++) {
    const url = `http://${host}:${basePort + offset}`;
    if (!candidates.includes(url)) {
      candidates.push(url);
    }
  }

  const healthy = (await Promise.all(candidates.map(async (baseUrl) =>
    await isQkrpcServeHealthy(baseUrl, undefined, abortSignal) ? baseUrl : null))).filter(Boolean);
  abortSignal?.throwIfAborted();
  if (healthy.length > 1) throw new Error("HOST_SELECTION_REQUIRED: multiple qkrpc gateways are available; configure one explicitly.");
  for (const baseUrl of healthy) {
    if (normalizeBase(process.env.QKRPC_HTTP_URL ?? "") !== baseUrl) {
      process.env.QKRPC_HTTP_URL = baseUrl;
      process.env.QKRPC_TRANSPORT = "http";
    }
    const portMatch = baseUrl.match(/:(\d+)(?:\/|$)/);
    const port = portMatch ? Number(portMatch[1]) : basePort;
    return { baseUrl, port };
  }

  return null;
}
