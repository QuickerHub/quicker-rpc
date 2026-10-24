import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createSocketServer } from "node:net";
import { isAbsolute, join, resolve } from "node:path";

export const SMOKE_PROTOCOL = "QUICKER_AGENT_SMOKE_PROTOCOL_V1";
const pathKey = (path) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);

/** Explicit test-only initialization happens before main.mjs can access a profile. */
export function initializeSmokeIsolation(app, env = process.env, fs = { mkdirSync, realpathSync }) {
  if (!env.QUICKER_AGENT_SMOKE_ROOT) return null;
  const root = env.QUICKER_AGENT_SMOKE_ROOT;
  const runId = env.QUICKER_AGENT_SMOKE_RUN_ID;
  if (!isAbsolute(root) || !/^[a-f0-9]{32}$/.test(runId ?? "")
    || pathKey(fs.realpathSync(root)) !== pathKey(root)) throw new Error("Invalid isolated smoke root/run id");
  const paths = {
    APPDATA: "roaming", LOCALAPPDATA: "local", USERPROFILE: "home", HOME: "home",
    TEMP: "temp", TMP: "temp", AGENT_GUI_ROOT: "app-state", AGENT_GUI_DEFAULT_CWD: "workspace",
    QUICKER_AGENT_DATA_DIR: "data",
  };
  for (const [key, suffix] of Object.entries(paths)) {
    const expected = join(root, suffix);
    if (pathKey(env[key] ?? "") !== pathKey(expected)) throw new Error(`Smoke ${key} is not isolated`);
    fs.mkdirSync(expected, { recursive: true });
  }
  for (const [name, suffix] of Object.entries({ appData: "roaming", userData: "profile", sessionData: "sessions", logs: "logs" })) {
    const path = join(root, suffix);
    fs.mkdirSync(path, { recursive: true });
    app.setPath(name, path);
  }
  return { root: resolve(root), runId, protocol: SMOKE_PROTOCOL };
}

/** An ephemeral reservation is always closed; a bind race fails rather than attaching elsewhere. */
export function reserveSmokeUiPort(factory = createSocketServer) {
  return new Promise((resolvePromise, reject) => {
    const server = factory();
    server.once("error", (error) => { server.close(() => {}); reject(error); });
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolvePromise(port));
    });
  });
}

/** UI smoke never connects to the user's fixed Quicker pipe or an existing serve. */
export function startSmokeRpcGuard(factory = createServer) {
  return new Promise((resolvePromise, reject) => {
    const server = factory((request, response) => {
      const health = request.method === "GET" && request.url === "/health";
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify(health
        ? { ok: false, pong: "pong", protocolVersion: 1, pipe: "isolated-smoke", hostRpcDisabled: true }
        : { ok: false, error: "SMOKE_HOST_RPC_DISABLED", message: "Host RPC is disabled in isolated UI smoke." }));
    });
    server.once("error", (error) => { server.close(() => {}); reject(error); });
    server.listen(0, "127.0.0.1", () => resolvePromise({
      port: server.address().port,
      close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(done); }),
    }));
  });
}

export function writeSmokeHandshake(smoke, detail, fs = { writeFileSync, renameSync }) {
  const temporary = join(smoke.root, "ready.json.tmp");
  fs.writeFileSync(temporary, JSON.stringify({
    protocol: SMOKE_PROTOCOL, runId: smoke.runId, rootPid: process.pid,
    userData: join(smoke.root, "profile"), hostRpcDisabled: true, ...detail,
  }), { flag: "wx" });
  fs.renameSync(temporary, join(smoke.root, "ready.json"));
}

/** PowerShell approves only after the job and exact listener PIDs have been verified. */
export async function waitForSmokeApproval(smoke, options = {}) {
  const read = options.read ?? ((path) => readFileSync(path, "utf8"));
  const sleep = options.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  const deadline = Date.now() + (options.timeoutMs ?? 90_000);
  while (Date.now() < deadline) {
    try {
      const approval = JSON.parse(read(join(smoke.root, "approved.json")));
      if (approval.runId === smoke.runId && approval.protocol === SMOKE_PROTOCOL) return;
      throw new Error("Invalid smoke approval");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for owned smoke listener approval");
}
