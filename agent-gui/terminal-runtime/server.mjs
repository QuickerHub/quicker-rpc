import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { loadConfig, PROTOCOL_VERSION, RUNTIME_VERSION } from "./config.mjs";
import { getPtyPool } from "./pty-pool.mjs";
import { warmupPtyStack } from "./pty-session.mjs";
import { attachTerminalSocket, getTerminalSessionManager } from "./ws-handler.mjs";

const config = loadConfig();

/** @param {import("node:http").ServerResponse} res */
function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/** @param {import("node:http").ServerResponse} res @param {number} status @param {unknown} body */
function sendJson(res, status, body) {
  applyCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
function handleRequest(req, res) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    applyCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET" && path === "/health") {
    const manager = getTerminalSessionManager();
    sendJson(res, 200, {
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      runtimeVersion: RUNTIME_VERSION,
      sessionCount: manager.sessionCount,
    });
    return;
  }

  if (req.method === "GET" && path === "/v1/terminal/sessions") {
    const manager = getTerminalSessionManager();
    sendJson(res, 200, { ok: true, sessions: manager.listSessions() });
    return;
  }

  sendJson(res, 404, { ok: false, message: "Not found" });
}

const server = createServer((req, res) => {
  handleRequest(req, res);
});

const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (ws) => {
  attachTerminalSocket(ws);
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  if (url.pathname !== "/v1/terminal/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

async function shutdown() {
  console.log("[terminal-runtime] shutting down");
  getTerminalSessionManager().shutdown();
  wss.close();
  server.close();
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
    `[terminal-runtime] quicker-terminal-runtime ${RUNTIME_VERSION} listening on http://${config.host}:${config.port}/health`,
  );
  setImmediate(() => {
    warmupPtyStack();
    getPtyPool().warmup(
      dirname(fileURLToPath(import.meta.url)),
      process.env.QUICKER_RPC_REPO_ROOT?.trim() || undefined,
      undefined,
    );
  });
});
