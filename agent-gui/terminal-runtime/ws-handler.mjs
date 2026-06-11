import { PROTOCOL_VERSION } from "./config.mjs";
import { TerminalSessionManager } from "./session-manager.mjs";

/** @type {TerminalSessionManager | null} */
let sharedManager = null;

export function getTerminalSessionManager() {
  if (!sharedManager) {
    sharedManager = new TerminalSessionManager();
  }
  return sharedManager;
}

/**
 * @param {import("ws").WebSocket} ws
 */
export function attachTerminalSocket(ws) {
  const manager = getTerminalSessionManager();
  let closed = false;

  const send = (payload) => {
    if (closed || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(payload));
  };

  const cleanup = () => {
    if (closed) return;
    closed = true;
    manager.detachSocket(ws, send);
  };

  send({
    type: "connected",
    protocolVersion: PROTOCOL_VERSION,
    sessions: manager.listSessions(),
  });

  ws.on("message", (raw, isBinary) => {
    if (closed) return;
    let msg;
    try {
      const text = isBinary && Buffer.isBuffer(raw)
        ? raw.toString("utf8")
        : String(raw);
      msg = JSON.parse(text);
    } catch {
      send({ type: "error", message: "Invalid JSON" });
      return;
    }
    if (!msg || typeof msg !== "object") {
      send({ type: "error", message: "Message must be a JSON object" });
      return;
    }

    const type = String(msg.type ?? "").trim();

    if (type === "list") {
      send({
        type: "sessions",
        sessions: manager.listSessions(),
      });
      return;
    }

    if (type === "warmup") {
      manager.warmupPool(typeof msg.cwd === "string" ? msg.cwd : undefined);
      send({ type: "warmed" });
      return;
    }

    if (type === "create") {
      manager.createSession(ws, send, {
        sessionId: typeof msg.sessionId === "string" ? msg.sessionId : undefined,
        cwd: typeof msg.cwd === "string" ? msg.cwd : undefined,
        cols: Number(msg.cols),
        rows: Number(msg.rows),
      });
      return;
    }

    if (type === "attach") {
      const sessionId = String(msg.sessionId ?? "").trim();
      if (!sessionId) {
        send({ type: "error", message: "sessionId is required" });
        return;
      }
      manager.attachSocket(ws, send, sessionId, {
        cols: Number(msg.cols),
        rows: Number(msg.rows),
      });
      return;
    }

    const sessionId = String(msg.sessionId ?? "").trim();
    if (!sessionId) {
      send({ type: "error", message: "sessionId is required" });
      return;
    }

    if (type === "detach") {
      if (manager.detachSocketFromSession(ws, sessionId)) {
        send({ type: "detached", sessionId });
      } else {
        send({ type: "error", message: `Unknown session: ${sessionId}` });
      }
      return;
    }

    if (type === "input") {
      const data = typeof msg.data === "string" ? msg.data : "";
      if (!manager.writeInput(sessionId, data)) {
        send({ type: "error", message: `Cannot write to session: ${sessionId}` });
      }
      return;
    }

    if (type === "resize") {
      manager.resizeSession(sessionId, msg.cols, msg.rows);
      return;
    }

    if (type === "dispose") {
      manager.disposeSession(sessionId);
      send({ type: "disposed", sessionId });
      return;
    }

    send({ type: "error", message: `Unknown message type: ${type}` });
  });

  ws.on("close", cleanup);
  ws.on("error", cleanup);
}
