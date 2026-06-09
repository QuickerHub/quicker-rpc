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

/** @param {string} base @param {number} [timeoutMs] */
export async function isQkrpcServeHealthy(base, timeoutMs = 1_500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${normalizeBase(base)}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status !== 200 && res.status !== 503) return false;
    const body = await res.json();
    return typeof body?.ok === "boolean";
  } catch {
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
 * @returns {Promise<{ baseUrl: string, port: number } | null>}
 */
export async function discoverHealthyQkrpcServe(
  host = "127.0.0.1",
  scanFromPort = preferredPort(),
  maxPorts = 32,
) {
  /** @type {string[]} */
  const candidates = [];

  const configured =
    process.env.QKRPC_HTTP_URL?.trim()
    ?? process.env.QKRPC_HTTP?.trim();
  if (configured) {
    candidates.push(normalizeBase(configured));
  }

  const basePort =
    Number.isFinite(scanFromPort) && scanFromPort > 0 ? scanFromPort : 9477;
  for (let offset = 0; offset < maxPorts; offset++) {
    const url = `http://${host}:${basePort + offset}`;
    if (!candidates.includes(url)) {
      candidates.push(url);
    }
  }

  for (const baseUrl of candidates) {
    if (!(await isQkrpcServeHealthy(baseUrl))) {
      continue;
    }
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
