import { createServer } from "node:http";
import { Cursor, CursorAgentError } from "@cursor/sdk";
import { loadConfig, PROTOCOL_VERSION, RUNTIME_VERSION } from "./config.mjs";
import {
  defaultModelId,
  quickerRpcAgentOptions,
  requireCursorSdkApiKey,
  resolveCursorSdkApiKey,
  resolveQkrpcExe,
  resolveRepoRoot,
} from "./agent-config.mjs";
import {
  disposeSession,
  getOrCreateSession,
  listSessionIds,
} from "./session-store.mjs";

const config = loadConfig();

/** @param {import("node:http").ServerResponse} res */
function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/** @param {import("node:http").ServerResponse} res @param {number} status @param {unknown} body */
function sendJson(res, status, body) {
  applyCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/** @param {import("node:http").IncomingMessage} req */
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
async function handleStatus(_req, res) {
  const apiKey = resolveCursorSdkApiKey();
  let qkrpcExe = null;
  let qkrpcError = null;

  try {
    qkrpcExe = resolveQkrpcExe();
  } catch (err) {
    qkrpcError = err instanceof Error ? err.message : String(err);
  }

  let remoteModels;
  if (apiKey) {
    try {
      const listed = await Cursor.models.list({ apiKey });
      remoteModels = listed.slice(0, 24).map((item) => ({
        id: item.id,
        label: item.displayName?.trim() || item.id,
      }));
    } catch {
      remoteModels = undefined;
    }
  }

  sendJson(res, 200, {
    ok: true,
    configured: Boolean(apiKey),
    defaultModel: defaultModelId(),
    remoteModels,
    repoRoot: resolveRepoRoot(),
    qkrpcExe,
    qkrpcError,
    activeSessions: listSessionIds().length,
  });
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
async function handleChat(req, res) {
  if (!resolveCursorSdkApiKey()) {
    sendJson(res, 503, {
      ok: false,
      error: "CURSOR_API_KEY is not configured on the server.",
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
    return;
  }

  const sessionId = String(body.sessionId ?? "").trim();
  const prompt = String(body.prompt ?? "").trim();
  const cwd = String(body.cwd ?? resolveRepoRoot()).trim();
  const modelId = String(body.model ?? defaultModelId()).trim();
  const newSession = body.newSession === true;

  if (!sessionId) {
    sendJson(res, 400, { ok: false, error: "sessionId is required" });
    return;
  }
  if (!prompt) {
    sendJson(res, 400, { ok: false, error: "Empty user message" });
    return;
  }

  try {
    requireCursorSdkApiKey();
    if (newSession) {
      await disposeSession(sessionId);
    }

    const session = await getOrCreateSession({
      sessionId,
      cwd,
      modelId,
      forceNew: newSession,
    });

    const run = await session.agent.send(prompt);

    applyCors(res);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("X-Cursor-Sdk-Agent-Id", session.agentId);
    res.setHeader("X-Cursor-Sdk-Model", modelId);

    for await (const event of run.stream()) {
      res.write(`${JSON.stringify(event)}\n`);
    }

    const result = await run.wait();
    res.write(
      `${JSON.stringify({
        type: "__result__",
        status: result.status,
        result: result.result,
        requestId: result.requestId,
      })}\n`,
    );
    res.end();
  } catch (err) {
    const message =
      err instanceof CursorAgentError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: message });
      return;
    }
    res.write(`${JSON.stringify({ type: "__error__", error: message })}\n`);
    res.end();
  }
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
async function handleDeleteSession(req, res) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
    return;
  }

  const sessionId = String(body.sessionId ?? "").trim();
  if (!sessionId) {
    sendJson(res, 400, { ok: false, error: "sessionId is required" });
    return;
  }

  const disposed = await disposeSession(sessionId);
  sendJson(res, 200, { ok: true, disposed });
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
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
      runtimeVersion: RUNTIME_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      sessionCount: listSessionIds().length,
    });
    return;
  }

  if (req.method === "GET" && path === "/v1/status") {
    await handleStatus(req, res);
    return;
  }

  if (req.method === "POST" && path === "/v1/chat") {
    await handleChat(req, res);
    return;
  }

  if (req.method === "DELETE" && path === "/v1/session") {
    await handleDeleteSession(req, res);
    return;
  }

  sendJson(res, 404, { ok: false, message: "Not found" });
}

const server = createServer((req, res) => {
  void handleRequest(req, res);
});

async function shutdown() {
  console.log("[cursor-sdk-runtime] shutting down");
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
    `[cursor-sdk-runtime] ${RUNTIME_VERSION} listening on http://${config.host}:${config.port}/health`,
  );
});
