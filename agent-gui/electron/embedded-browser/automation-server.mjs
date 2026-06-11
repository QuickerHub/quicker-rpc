import { createServer } from "node:http";
import { invokeError } from "../../browser-runtime/protocol.mjs";

export const EMBEDDED_BROWSER_RUNTIME_VERSION = "0.1.0";
export const EMBEDDED_BROWSER_PROTOCOL_VERSION = "quicker-embedded-browser-v1";
export const DEFAULT_EMBEDDED_BROWSER_PORT = 6018;

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
export function startEmbeddedBrowserAutomationServer(automation, options = {}) {
  const { host, port } = resolveEmbeddedBrowserServerConfig(options);

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

  const server = createServer((req, res) => {
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

  server.listen(port, host, () => {
    console.log(
      `[embedded-browser] automation server ${EMBEDDED_BROWSER_RUNTIME_VERSION} on http://${host}:${port}/health`,
    );
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
