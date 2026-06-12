import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { invokeError } from "../../browser-runtime/protocol.mjs";

export const EMBEDDED_BROWSER_RUNTIME_VERSION = "0.1.0";
export const EMBEDDED_BROWSER_PROTOCOL_VERSION = "quicker-embedded-browser-v1";
export const DEFAULT_EMBEDDED_BROWSER_PORT = 6018;

/**
 * @param {string} host
 * @param {number} port
 */
export function isEmbeddedBrowserPortFree(host, port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => {
      probe.close(() => resolve(true));
    });
  });
}

/**
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs]
 */
export async function probeEmbeddedBrowserHealth(host, port, timeoutMs = 800) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${host}:${port}/health`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (
      body?.ok === true
      && body.protocolVersion === EMBEDDED_BROWSER_PROTOCOL_VERSION
    ) {
      return body;
    }
  } catch {
    // unreachable or non-embedded-browser server
  } finally {
    clearTimeout(timer);
  }
  return null;
}

/**
 * @param {string} host
 * @param {number} preferredPort
 * @param {number} [maxAttempts]
 */
export async function resolveEmbeddedBrowserListenPort(
  host,
  preferredPort,
  maxAttempts = 200,
) {
  if (await isEmbeddedBrowserPortFree(host, preferredPort)) {
    return preferredPort;
  }

  const existing = await probeEmbeddedBrowserHealth(host, preferredPort);
  if (existing) {
    console.warn(
      `[embedded-browser] port ${preferredPort} already serves ${EMBEDDED_BROWSER_PROTOCOL_VERSION}; using next free port`,
    );
  } else {
    console.warn(
      `[embedded-browser] port ${preferredPort} busy; using next free port`,
    );
  }

  for (let port = preferredPort + 1; port < preferredPort + maxAttempts; port++) {
    if (await isEmbeddedBrowserPortFree(host, port)) {
      return port;
    }
  }
  throw new Error(
    `no free embedded-browser port from ${preferredPort} on ${host}`,
  );
}

/**
 * @param {{ host?: string; port?: number }} [options]
 */
export function resolveEmbeddedBrowserServerConfig(options = {}) {
  const host =
    options.host
    ?? process.env.QUICKER_EMBEDDED_BROWSER_HOST?.trim()
    ?? process.env.AGENT_GUI_EMBEDDED_BROWSER_HOST?.trim()
    ?? "127.0.0.1";
  const portRaw =
    options.port
    ?? process.env.QUICKER_EMBEDDED_BROWSER_PORT?.trim()
    ?? process.env.AGENT_GUI_EMBEDDED_BROWSER_PORT?.trim()
    ?? String(DEFAULT_EMBEDDED_BROWSER_PORT);
  const port = Number.parseInt(String(portRaw), 10);
  return {
    host,
    port: Number.isFinite(port) && port > 0 && port <= 65535
      ? port
      : DEFAULT_EMBEDDED_BROWSER_PORT,
  };
}

/**
 * @param {import('./automation-engine.mjs').createEmbeddedBrowserAutomation extends (...args: any) => infer R ? R : never} automation
 * @param {{ host?: string; port?: number }} [options]
 */
export async function startEmbeddedBrowserAutomationServer(automation, options = {}) {
  const { host, port: preferredPort } = resolveEmbeddedBrowserServerConfig(options);
  const port = await resolveEmbeddedBrowserListenPort(host, preferredPort);

  if (port !== preferredPort) {
    process.env.QUICKER_EMBEDDED_BROWSER_PORT = String(port);
    process.env.AGENT_GUI_EMBEDDED_BROWSER_PORT = String(port);
  }
  process.env.QUICKER_EMBEDDED_BROWSER_HOST ??= host;
  process.env.AGENT_GUI_EMBEDDED_BROWSER_HOST ??= host;

  /** @param {import('node:http').ServerResponse} res */
  function applyCors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  /** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} body */
  function sendJson(res, status, body) {
    applyCors(res);
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  }

  /** @param {import('node:http').IncomingMessage} req */
  function readBody(req) {
    return new Promise((resolve, reject) => {
      /** @type {Buffer[]} */
      const chunks = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }

  const server = createHttpServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);
      const path = url.pathname;

      if (req.method === "OPTIONS") {
        applyCors(res);
        res.statusCode = 204;
        res.end();
        return;
      }

      if (req.method === "GET" && path === "/health") {
        sendJson(res, 200, {
          ok: true,
          protocolVersion: EMBEDDED_BROWSER_PROTOCOL_VERSION,
          runtimeVersion: EMBEDDED_BROWSER_RUNTIME_VERSION,
          mode: "native",
          platform: process.platform,
        });
        return;
      }

      if (req.method === "POST" && path === "/v1/invoke") {
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          sendJson(res, 400, invokeError("Invalid JSON body"));
          return;
        }
        if (!body || typeof body !== "object") {
          sendJson(res, 400, invokeError("Body must be a JSON object"));
          return;
        }
        const op = String(body.op ?? "").trim();
        if (!op) {
          sendJson(res, 400, invokeError("op is required"));
          return;
        }
        const sessionId = String(body.sessionId ?? "default").trim() || "default";
        const args = body.args && typeof body.args === "object" ? body.args : {};
        const result = await automation.invoke(op, args, sessionId);
        sendJson(res, result.ok ? 200 : 502, result);
        return;
      }

      sendJson(res, 404, invokeError("Not found"));
    })();
  });

  await new Promise((resolve, reject) => {
    /** @param {Error} err */
    const onListenError = (err) => {
      reject(err);
    };
    server.once("error", onListenError);
    server.listen(port, host, () => {
      server.removeListener("error", onListenError);
      console.log(
        `[embedded-browser] automation server ${EMBEDDED_BROWSER_RUNTIME_VERSION} on http://${host}:${port}/health`,
      );
      resolve(undefined);
    });
  });

  server.on("error", (err) => {
    console.error("[embedded-browser] automation server error:", err);
  });

  return {
    server,
    host,
    port,
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve(undefined)));
      });
    },
  };
}
