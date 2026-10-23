import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { loadConfig, PROTOCOL_VERSION, RUNTIME_VERSION } from "./config.mjs";
import { attachPanelStream } from "./panel-stream.mjs";
import { SessionManager } from "./session-manager.mjs";
import { handleBrowserInvokeRequest } from "./invoke-request.mjs";

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
      runtimeOwner: process.env.QUICKER_AGENT_RUNTIME_OWNER,
      browserReady: manager.browserReady,
      browserError: manager.browserError,
      sessionCount: manager.sessionCount,
      headless: config.headless,
      channel: config.channel,
    });
    return;
  }

  if (req.method === "POST" && path === "/v1/invoke") {
    await handleBrowserInvokeRequest(req, res, manager.invoke.bind(manager), sendJson);
    return;
  }

  sendJson(res, 404, { ok: false, message: "Not found" });
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

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
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

if (process.send) {
  process.once("disconnect", () => { void shutdown(); });
  process.on("message", (message) => { if (message === "shutdown") void shutdown(); });
}
