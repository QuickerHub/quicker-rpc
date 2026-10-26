import "server-only";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { loadAgentMcpConfigLayers, mergeAgentMcpConfigLayers, resolveAgentMcpConfigPaths, QUICKER_NATIVE_MCP_SERVER_NAME, type AgentMcpConfigLayer } from "./agent-mcp/config";
import { assertSafeLocalMcpPath, inspectQuickerNativeMcpSource, readGuardedLocalMcpFile } from "./agent-mcp/native-quicker-source.server";
import { probeQuickerNativeMcp } from "./agent-mcp/native-quicker-probe.server";
import { parseLosslessJson, stringifyLosslessJson } from "./action-editor/shared/losslessJson";
import { withReleasePreviewRoute } from "./release-preview.server";
import type { QuickerNativeMcpSettingsRequest, QuickerNativeMcpSettingsResponse, QuickerNativeMcpSettingsState } from "./quicker-native-mcp-settings";

const revisionKey = randomBytes(32);
const writes = new Map<string, Promise<void>>();
const name = QUICKER_NATIVE_MCP_SERVER_NAME;
type Dependencies = {
  configPaths?: typeof resolveAgentMcpConfigPaths;
  loadLayers?: typeof loadAgentMcpConfigLayers;
  inspect?: typeof inspectQuickerNativeMcpSource;
  probe?: typeof probeQuickerNativeMcp;
  guardPath?: typeof assertSafeLocalMcpPath;
  readFile?: typeof readGuardedLocalMcpFile;
  renameFile?: typeof rename;
};
class SettingsError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const unavailable = () => new SettingsError(503, "SETTINGS_UNAVAILABLE", "无法安全读取或保存原生 MCP 设置，请检查配置后重试。");
const conflict = () => new SettingsError(409, "SETTINGS_CHANGED", "配置或本机来源已变化，请刷新配置后重新核对。");
function response(body: QuickerNativeMcpSettingsResponse, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "no-store" } }); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Map); }
function validCwd(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 8192 && isAbsolute(value) && !/[\0\r\n]/.test(value);
}
function canonicalEntries(layer: AgentMcpConfigLayer) { return layer.entries.filter(entry => entry.name.toLowerCase() === name); }
function rejectDuplicateProperties(raw: string) {
  const tokens = [...raw.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)];
  const stack: Array<Set<string> | null> = [];
  tokens.forEach((token, index) => {
    if (token[0] === "{") stack.push(new Set());
    else if (token[0] === "[") stack.push(null);
    else if (token[0] === "}" || token[0] === "]") stack.pop();
    else if (token[0].startsWith('"') && tokens[index + 1]?.[0] === ":") {
      const keys = stack.at(-1), key = JSON.parse(token[0]) as string;
      if (!keys || keys.has(key)) throw unavailable();
      keys.add(key);
    }
  });
}
async function locked<T>(path: string, signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  const key = process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
  const previous = writes.get(key) ?? Promise.resolve();
  let release!: () => void;
  const lock = new Promise<void>(done => { release = done; });
  const tail = previous.catch(() => {}).then(() => lock);
  writes.set(key, tail);
  try { await previous.catch(() => {}); signal.throwIfAborted(); return await fn(); }
  finally { release(); if (writes.get(key) === tail) writes.delete(key); }
}

export function createQuickerNativeMcpSettingsHandlers(dependencies: Dependencies = {}) {
  const guard = dependencies.guardPath ?? assertSafeLocalMcpPath;
  const pathsFor = (cwd: string) => {
    const paths = (dependencies.configPaths ?? resolveAgentMcpConfigPaths)(cwd);
    if (paths.length !== 2 || paths.some(path => !isAbsolute(path) || basename(path) !== "mcp.json")) throw unavailable();
    return paths.map(path => resolve(path));
  };
  const guardConfig = async (path: string, signal: AbortSignal) => {
    let candidate = path, expected: "file" | "directory" = "file";
    for (;;) {
      try { await guard(candidate, signal, expected); return; }
      catch (error) {
        signal.throwIfAborted();
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw unavailable();
        const parent = dirname(candidate);
        if (parent === candidate) throw unavailable();
        candidate = parent; expected = "directory";
      }
    }
  };
  const snapshot = async (cwd: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    const paths = pathsFor(cwd);
    for (const path of paths) await guardConfig(path, signal);
    const layers = await (dependencies.loadLayers ?? loadAgentMcpConfigLayers)(cwd, paths);
    const discovery = await (dependencies.inspect ?? inspectQuickerNativeMcpSource)(signal);
    for (const path of paths) await guardConfig(path, signal);
    signal.throwIfAborted();
    const [user, workspace] = layers;
    if (!user || !workspace || layers.length !== 2) throw unavailable();
    const userEntries = canonicalEntries(user), workspaceEntries = canonicalEntries(workspace);
    const userEntry = userEntries[0]?.server, workspaceEntry = workspaceEntries[0]?.server;
    const invalidLayer = layers.some(layer => layer.status === "invalid" || layer.status === "unavailable");
    const duplicate = userEntries.length > 1 || workspaceEntries.length > 1;
    const customUser = userEntries.length > 0 && userEntry?.source !== "quicker-native";
    const blocked = invalidLayer || duplicate || customUser || workspaceEntries.length > 0;
    const scope = workspaceEntries.length ? "workspace" : userEntries.length ? "user" : "none";
    const effectiveEntry = workspaceEntries.length ? workspaceEntry : userEntry;
    const merged = mergeAgentMcpConfigLayers(layers);
    const effectiveEnabled = !invalidLayer && !duplicate && merged.servers.some(server => server.name.toLowerCase() === name && server.source === "quicker-native" && server.enabled);
    const revision = createHmac("sha256", revisionKey).update(JSON.stringify({ cwd,
      layers: layers.map(layer => ({ path: layer.path, revision: layer.revision, status: layer.status })),
      native: { status: discovery.status, identity: discovery.identity },
    })).digest("hex");
    const state: QuickerNativeMcpSettingsState = { cwd, revision,
      userEnabled: userEntries.length === 1 && userEntry?.source === "quicker-native" && userEntry.enabled === true,
      userManaged: userEntries.length === 1 && userEntry?.source === "quicker-native",
      effective: { enabled: effectiveEnabled, scope, managed: effectiveEntry?.source === "quicker-native", blocked,
        ...(blocked ? { message: invalidLayer ? "配置文件无效或不可读，请先修复配置。" : duplicate ? "quicker-local 存在重复大小写名称，请先消除歧义。"
          : workspaceEntries.length ? "工作区同名配置优先；此处不会修改工作区配置。" : "quicker-local 已由其他来源占用；此处不会覆盖。" } : {}) },
      discovery, observedAt: new Date().toISOString() };
    return { state, paths, layers };
  };
  const checked = async (input: QuickerNativeMcpSettingsRequest, signal: AbortSignal) => {
    const current = await snapshot(input.cwd, signal);
    if (current.state.revision !== input.revision) throw conflict();
    return current;
  };
  const ensureDirectory = async (path: string, signal: AbortSignal): Promise<void> => {
    try { await guard(path, signal, "directory"); return; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const parent = dirname(path);
    if (parent === path) throw unavailable();
    await ensureDirectory(parent, signal);
    signal.throwIfAborted();
    try { await mkdir(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    await guard(path, signal, "directory");
  };
  const write = async (input: QuickerNativeMcpSettingsRequest, signal: AbortSignal) => locked(pathsFor(input.cwd)[0], signal, async () => {
    const before = await checked(input, signal);
    if (before.state.effective.blocked) throw new SettingsError(409, "SETTINGS_BLOCKED", before.state.effective.message!);
    const file = before.paths[0], parent = dirname(file);
    let raw = "";
    if (before.layers[0].status !== "missing") raw = (await (dependencies.readFile ?? readGuardedLocalMcpFile)(file, signal)).raw.toString("utf8");
    const root: unknown = raw ? parseLosslessJson(raw) : {};
    if (raw) rejectDuplicateProperties(raw);
    if (!record(root) || (Object.hasOwn(root, "mcpServers") && !record(root.mcpServers))) throw unavailable();
    const servers = record(root.mcpServers) ? root.mcpServers : {};
    const originalName = Object.keys(servers).find(key => key.toLowerCase() === name) ?? name;
    const existing = servers[originalName];
    if (existing !== undefined && (!record(existing) || existing.source !== "quicker-native")) throw unavailable();
    Object.defineProperty(servers, originalName, { configurable: true, enumerable: true, writable: true,
      value: { ...(record(existing) ? existing : {}), source: "quicker-native", enabled: input.enabled } });
    Object.defineProperty(root, "mcpServers", { configurable: true, enumerable: true, writable: true, value: servers });
    const contents = `${raw.startsWith("\uFEFF") ? "\uFEFF" : ""}${stringifyLosslessJson(root, 2)}\n`;
    if (Buffer.byteLength(contents) > 64 * 1024) throw unavailable();
    await checked(input, signal);
    await guardConfig(file, signal);
    await ensureDirectory(parent, signal);
    await guard(parent, signal, "directory");
    const temp = join(parent, `.mcp.json.${randomUUID()}.tmp`);
    let owned = false;
    try {
      const handle = await open(temp, "wx", 0o600); owned = true;
      try { await handle.writeFile(contents, "utf8"); await handle.sync(); } finally { await handle.close(); }
      await guard(temp, signal, "file");
      await checked(input, signal);
      await guardConfig(file, signal);
      await guard(parent, signal, "directory");
      signal.throwIfAborted();
      await (dependencies.renameFile ?? rename)(temp, file); owned = false;
      // Cancellation after publication is acknowledgement loss, never a reason to repeat the write.
      try { signal.throwIfAborted(); return (await snapshot(input.cwd, signal)).state; }
      catch { throw new SettingsError(503, "SAVE_RESULT_UNKNOWN", "设置可能已生效，请刷新配置确认；不要自动重试保存。"); }
    } finally {
      if (owned) {
        try { await guard(parent, undefined, "directory"); await unlink(temp); } catch { /* Do not follow a changed parent during cleanup. */ }
      }
    }
  });
  const failure = async (error: unknown, cwd: string | undefined, signal: AbortSignal) => {
    const known = error instanceof SettingsError ? error : unavailable();
    let state: QuickerNativeMcpSettingsState | undefined;
    if (cwd && !signal.aborted) { try { state = (await snapshot(cwd, signal)).state; } catch { /* Fixed error only. */ } }
    return response({ ok: false, error: { code: known.code, message: known.message }, ...(state ? { state } : {}) }, known.status);
  };
  return {
    GET: (request: Request) => withReleasePreviewRoute(request, async () => {
      const cwd = new URL(request.url).searchParams.get("cwd");
      if (!validCwd(cwd)) return response({ ok: false, error: { code: "INVALID_CWD", message: "需要当前工作区的绝对路径。" } }, 400);
      try { return response({ ok: true, state: (await snapshot(cwd, request.signal)).state }); }
      catch (error) { return failure(error, undefined, request.signal); }
    }),
    POST: (request: Request) => withReleasePreviewRoute(request, async () => {
      let input: QuickerNativeMcpSettingsRequest;
      try {
        const text = await request.text();
        if (text.length > 16384) throw new Error();
        const body: unknown = JSON.parse(text);
        if (!record(body) || !validCwd(body.cwd) || typeof body.revision !== "string" || !/^[a-f0-9]{64}$/.test(body.revision)
          || !["probe", "set-enabled"].includes(String(body.action))
          || Object.keys(body).some(key => !["action", "cwd", "revision", "enabled"].includes(key))
          || (body.action === "set-enabled" ? typeof body.enabled !== "boolean" : body.enabled !== undefined)) throw new Error();
        input = body as QuickerNativeMcpSettingsRequest;
      } catch { return response({ ok: false, error: { code: "INVALID_REQUEST", message: "原生 MCP 设置请求无效，请刷新配置后重试。" } }, 400); }
      try {
        if (input.action === "set-enabled") return response({ ok: true, state: await write(input, request.signal) });
        const before = await checked(input, request.signal);
        const probe = await (dependencies.probe ?? probeQuickerNativeMcp)(request.signal);
        const after = await checked(input, request.signal);
        if (probe.status === "ok" && (!probe.sourceIdentity || probe.sourceIdentity !== before.state.discovery.identity)) throw conflict();
        return response({ ok: true, state: after.state, probe });
      } catch (error) { return failure(error, input.cwd, request.signal); }
    }),
  };
}
