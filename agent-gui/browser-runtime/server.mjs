import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { loadConfig, PROTOCOL_VERSION, RUNTIME_VERSION } from "./config.mjs";
import { attachPanelStream } from "./panel-stream.mjs";
import { SessionManager } from "./session-manager.mjs";

const config = loadConfig();
const manager = new SessionManager(config);

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

/** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
async function handleRequest(req, res) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
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
      protocolVersion: PROTOCOL_VERSION,
      runtimeVersion: RUNTIME_VERSION,
      browserReady: manager.browserReady,
      browserError: manager.browserError,
      sessionCount: manager.sessionCount,
      headless: config.headless,
      channel: config.channel,
    });
    return;
  }

  if (req.method === "POST" && path === "/v1/invoke") {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
      return;
    }
    if (!body || typeof body !== "object") {
      sendJson(res, 400, { ok: false, message: "Body must be a JSON object" });
      return;
    }
    const op = String(body.op ?? "").trim();
    if (!op) {
      sendJson(res, 400, { ok: false, message: "op is required" });
      return;
    }
    const sessionId = String(body.sessionId ?? "default").trim() || "default";
    const args = body.args && typeof body.args === "object" ? body.args : {};
    const result = await manager.invoke(op, args, sessionId);
    sendJson(res, result.ok ? 200 : 502, result);
    return;
  }

  sendJson(res, 404, { ok: false, message: "Not found" });
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
  void handleRequest(req, res);
});

const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (ws) => {
  attachPanelStream(ws, manager);
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  if (url.pathname !== "/v1/panel/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

async function shutdown() {
  console.log("[browser-runtime] shutting down");
  wss.close();
  server.close();
  await manager.shutdown();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

server.listen(config.port, config.host, () => {
  console.log(
    `[browser-runtime] quicker-browser-runtime ${RUNTIME_VERSION} listening on http://${config.host}:${config.port}/health`,
  );
});
