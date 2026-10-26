import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, open } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { promisify } from "node:util";

const identityKey = randomBytes(32);
const MAX_SETTINGS_BYTES = 64 * 1024;
const execFileAsync = promisify(execFile);
function systemPowerShell(): string {
  const root = process.env.SystemRoot;
  if (!root || !isAbsolute(root)) throw new NativeQuickerMcpError("unavailable");
  return join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}
export type QuickerNativeMcpDiscovery = {
  status: "found" | "missing" | "disabled" | "invalid" | "unavailable";
  identity: string | null;
  message?: string;
};
export type NativeMcpFailureCode = "unavailable" | "unauthorized" | "consent-required" | "error" | "source_changed";
const failureMessages: Record<NativeMcpFailureCode, string> = {
  unavailable: "本机 Quicker MCP 不可用，请在 Quicker 中检查 MCP 设置。",
  unauthorized: "Quicker 拒绝了当前 MCP 凭证，请检查 Quicker 设置后重新连接。",
  "consent-required": "请在 Quicker 中同意此客户端，然后重新连接。",
  error: "本机 Quicker MCP 连接失败，请检查 Quicker 后重新连接。",
  source_changed: "Quicker MCP 配置已变化，本次连接已停止，请重新连接。",
};
export class NativeQuickerMcpError extends Error {
  constructor(readonly code: NativeMcpFailureCode, readonly outcomeUnknown = false) {
    super(outcomeUnknown ? "Quicker MCP 请求已发出，但目标或操作结果无法确认；请检查当前状态，不要自动重试。" : failureMessages[code]);
    this.name = "NativeQuickerMcpError";
  }
}
export function nativeQuickerMcpFailure(error: unknown): { status: NativeMcpFailureCode; message: string } {
  const status = error instanceof NativeQuickerMcpError ? error.code : "error";
  return { status, message: error instanceof NativeQuickerMcpError ? error.message : failureMessages[status] };
}

type SourceFile = { raw: Buffer; fileIdentity: string };
export function nativeSourceAttributesAreSafe(attributes: number[], expectedCount: number): boolean {
  // ReparsePoint, Offline, RecallOnOpen, RecallOnDataAccess.
  return attributes.length === expectedCount && attributes.every((mask) => Number.isInteger(mask) && mask >= 0 && (mask & 0x441400) === 0);
}
export type NativeQuickerSourceDependencies = {
  settingsPath?: () => string;
  readSourceFile?: (path: string, signal?: AbortSignal) => Promise<SourceFile>;
  fetch?: typeof globalThis.fetch;
  endpointOwner?: (port: number, signal?: AbortSignal) => Promise<NativeEndpointOwner>;
};
export type NativeEndpointOwner = { pid: number; createdAt: string };

async function readEndpointOwner(port: number, signal?: AbortSignal): Promise<NativeEndpointOwner> {
  if (process.platform !== "win32") throw new NativeQuickerMcpError("unavailable");
  const script = "$ErrorActionPreference='Stop'; $nativePort=[int]$env:QK_NATIVE_SOURCE_PORT; "
    + "function Read-ListenerOwner { $ids=@(Get-NetTCPConnection -State Listen -LocalPort $nativePort -ErrorAction Stop | Where-Object { $_.LocalAddress -eq '127.0.0.1' -or $_.LocalAddress -eq '0.0.0.0' } | Select-Object -ExpandProperty OwningProcess -Unique); if ($ids.Count -ne 1 -or $ids[0] -le 0) { throw 'unavailable' }; return [int]$ids[0] }; "
    + "$firstOwner=Read-ListenerOwner; $firstProcess=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$firstOwner) -ErrorAction Stop; "
    + "if ($null -eq $firstProcess.CreationDate) { throw 'unavailable' }; $firstCreated=$firstProcess.CreationDate.ToUniversalTime().Ticks.ToString(); "
    + "$secondOwner=Read-ListenerOwner; $secondProcess=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$secondOwner) -ErrorAction Stop; "
    + "if ($firstOwner -ne $secondOwner -or $null -eq $secondProcess.CreationDate -or $firstCreated -ne $secondProcess.CreationDate.ToUniversalTime().Ticks.ToString()) { throw 'changed' }; "
    + "@{pid=$firstOwner;createdAt=$firstCreated} | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync(systemPowerShell(), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true, timeout: 5_000, maxBuffer: 4_096, signal,
    env: { ...process.env, QK_NATIVE_SOURCE_PORT: String(port) },
  });
  const owner = JSON.parse(stdout) as NativeEndpointOwner;
  if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.createdAt !== "string" || !/^\d+$/.test(owner.createdAt)) throw new NativeQuickerMcpError("unavailable");
  return owner;
}

function settingsPath(): string {
  const override = process.env.QUICKER_HOME?.trim();
  // A relative override depends on Quicker's own cwd, which this process cannot establish.
  if (override && !isAbsolute(override)) throw new NativeQuickerMcpError("unavailable");
  return join(override || join(homedir(), ".quicker"), "mcp", "server.json");
}

/** Metadata-only validation; callers must revalidate before committing a later file operation. */
export async function assertSafeLocalMcpPath(path: string, signal?: AbortSignal, expected: "file" | "directory" = "file"): Promise<void> {
  signal?.throwIfAborted();
  const absolute = resolve(path);
  if (absolute.startsWith("\\\\") || absolute.startsWith("//")
    || absolute.split(/[\\/]/).some((part) => /^(?:OneDrive(?:\b|\s|-)|Dropbox$|iCloud(?:\b|\s))/i.test(part))) {
    throw new NativeQuickerMcpError("unavailable");
  }
  const paths: string[] = [];
  for (let current = absolute;; current = dirname(current)) {
    paths.unshift(current);
    if (current === parse(current).root) break;
  }
  for (const [index, item] of paths.entries()) {
    const stat = await lstat(item);
    const isFile = index === paths.length - 1 && expected === "file";
    if (stat.isSymbolicLink() || (isFile ? !stat.isFile() : !stat.isDirectory())) throw new NativeQuickerMcpError("unavailable");
  }
  if (process.platform === "win32") {
    // Node stat omits Windows recall/offline attributes. Query metadata only, before opening any content.
    const { stdout } = await execFileAsync(systemPowerShell(), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
      "$ErrorActionPreference='Stop'; foreach ($candidate in ($env:QK_NATIVE_SOURCE_PATHS | ConvertFrom-Json)) { [Console]::WriteLine([int][IO.File]::GetAttributes([string]$candidate)) }"], {
      windowsHide: true, timeout: 5_000, maxBuffer: 8_192, signal,
      env: { ...process.env, QK_NATIVE_SOURCE_PATHS: JSON.stringify(paths) },
    });
    const attributes = stdout.trim().split(/\s+/).map(Number);
    if (!nativeSourceAttributesAreSafe(attributes, paths.length)) throw new NativeQuickerMcpError("unavailable");
  }
  signal?.throwIfAborted();
}

export async function readGuardedLocalMcpFile(path: string, signal?: AbortSignal): Promise<SourceFile> {
  await assertSafeLocalMcpPath(path, signal);
  const absolute = resolve(path);
  const handle = await open(absolute, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > MAX_SETTINGS_BYTES) throw new NativeQuickerMcpError("unavailable");
    const bytes = Buffer.alloc(MAX_SETTINGS_BYTES + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat();
    const current = await lstat(absolute);
    if (bytesRead > MAX_SETTINGS_BYTES || bytesRead !== before.size || current.isSymbolicLink() || before.ino !== current.ino
      || before.dev !== current.dev || before.mtimeMs !== after.mtimeMs || before.size !== after.size) throw new NativeQuickerMcpError("unavailable");
    signal?.throwIfAborted();
    return { raw: bytes.subarray(0, bytesRead), fileIdentity: JSON.stringify([before.dev, before.ino, before.birthtimeMs]) };
  } finally { await handle.close(); }
}

type Snapshot = { discovery: QuickerNativeMcpDiscovery; url?: string; token?: string };
async function readSnapshot(signal?: AbortSignal, dependencies: NativeQuickerSourceDependencies = {}): Promise<Snapshot> {
  signal?.throwIfAborted();
  let identity: string | null = null;
  try {
    const path = (dependencies.settingsPath ?? settingsPath)();
    const file = await (dependencies.readSourceFile ?? readGuardedLocalMcpFile)(path, signal);
    signal?.throwIfAborted();
    identity = createHmac("sha256", identityKey).update(path).update("\0").update(file.fileIdentity).update("\0").update(file.raw).digest("hex");
    let value: unknown;
    try { value = JSON.parse(file.raw.toString("utf8").replace(/^\uFEFF/, "")); } catch { return { discovery: { status: "invalid", identity, message: "Quicker MCP 配置格式无效。" } }; }
    if (!value || typeof value !== "object" || Array.isArray(value)) return { discovery: { status: "invalid", identity, message: "Quicker MCP 配置格式无效。" } };
    const fields = new Map<string, unknown>();
    for (const [name, item] of Object.entries(value)) {
      const key = name.toLowerCase();
      if (fields.has(key)) return { discovery: { status: "invalid", identity, message: "Quicker MCP 配置字段存在歧义。" } };
      fields.set(key, item);
    }
    if (fields.get("enabled") === false) return { discovery: { status: "disabled", identity, message: "请在 Quicker 中显式启用 MCP。" } };
    const port = fields.get("port"), token = fields.get("token");
    if (fields.get("enabled") !== true || !Number.isInteger(port) || (port as number) < 1024 || (port as number) > 65535
      || typeof token !== "string" || !token.trim() || /[\r\n\x00-\x1f\x7f]/.test(token)) {
      return { discovery: { status: "invalid", identity, message: "Quicker MCP 配置缺少有效启用状态、端口或凭证。" } };
    }
    return { discovery: { status: "found", identity }, url: `http://127.0.0.1:${port}/mcp`, token: token.trim() };
  } catch (error) {
    signal?.throwIfAborted();
    return { discovery: { status: (error as NodeJS.ErrnoException)?.code === "ENOENT" ? "missing" : "unavailable", identity, message: "无法读取本机 Quicker MCP 配置，请在 Quicker 中检查设置。" } };
  }
}

export async function inspectQuickerNativeMcpSource(signal?: AbortSignal, dependencies: NativeQuickerSourceDependencies = {}): Promise<QuickerNativeMcpDiscovery> {
  return (await readSnapshot(signal, dependencies)).discovery;
}

export type NativeQuickerMcpSource = { identity: string; url: string; fetch: typeof globalThis.fetch; failure: () => NativeQuickerMcpError | undefined; assertPublicData: (value: unknown) => void; assertCurrent: (afterDispatch?: boolean, signal?: AbortSignal) => Promise<void>; toolDispatchCount: () => number };
export async function resolveQuickerNativeMcpSource(signal?: AbortSignal, dependencies: NativeQuickerSourceDependencies = {}): Promise<NativeQuickerMcpSource> {
  const initial = await readSnapshot(signal, dependencies);
  if (initial.discovery.status !== "found" || !initial.url || !initial.token || !initial.discovery.identity) throw new NativeQuickerMcpError("unavailable");
  const { url, token } = initial;
  const port = Number(new URL(url).port);
  const observeOwner = dependencies.endpointOwner ?? readEndpointOwner;
  let owner: NativeEndpointOwner;
  try { owner = await observeOwner(port, signal); } catch { signal?.throwIfAborted(); throw new NativeQuickerMcpError("unavailable"); }
  if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.createdAt !== "string" || !owner.createdAt) throw new NativeQuickerMcpError("unavailable");
  let retired = false;
  let toolDispatches = 0;
  let lastFailure: NativeQuickerMcpError | undefined;
  const assertCurrent = async (afterDispatch = false, requestSignal?: AbortSignal) => {
    requestSignal?.throwIfAborted();
    if (retired) {
      if (afterDispatch) throw lastFailure = new NativeQuickerMcpError("source_changed", true);
      throw lastFailure ?? new NativeQuickerMcpError("source_changed");
    }
    try {
      const current = await readSnapshot(requestSignal, dependencies);
      const actual = await observeOwner(port, requestSignal);
      if (current.discovery.status !== "found" || current.discovery.identity !== initial.discovery.identity
        || actual.pid !== owner.pid || actual.createdAt !== owner.createdAt) throw new Error("changed");
      requestSignal?.throwIfAborted();
    } catch {
      requestSignal?.throwIfAborted();
      retired = true; throw lastFailure = new NativeQuickerMcpError("source_changed", afterDispatch);
    }
  };
  return {
    identity: initial.discovery.identity, url,
    failure: () => lastFailure,
    toolDispatchCount: () => toolDispatches,
    assertCurrent,
    assertPublicData: (value) => {
      // A server can echo credentials in successful metadata, schema keys or tool results.
      let serialized: string;
      try { serialized = JSON.stringify(value) ?? ""; } catch { throw lastFailure = new NativeQuickerMcpError("error"); }
      if (serialized.includes(token) || serialized.includes(JSON.stringify(token).slice(1, -1))) throw lastFailure = new NativeQuickerMcpError("error");
    },
    fetch: async (input, init) => {
      const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      const combined = requestSignal && signal ? AbortSignal.any([requestSignal, signal]) : requestSignal ?? signal;
      combined?.throwIfAborted();
      await assertCurrent(false, combined ?? undefined);
      const actualUrl = input instanceof Request ? input.url : String(input);
      if (actualUrl !== url) throw new NativeQuickerMcpError("error");
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set("Authorization", `Bearer ${token}`);
      try {
        // Native fetch does not opt into environment proxies. Refuse runtimes that globally enable them.
        if (process.env.NODE_USE_ENV_PROXY === "1" || process.execArgv.includes("--use-env-proxy")
          || /(?:^|\s)--use-env-proxy(?:\s|$)/.test(process.env.NODE_OPTIONS ?? "")) throw new NativeQuickerMcpError("unavailable");
        // Record dispatch only; the SDK still owns JSON-RPC framing, validation and execution.
        if (typeof init?.body === "string") {
          try { if (JSON.parse(init.body)?.method === "tools/call") toolDispatches++; } catch { /* SDK rejects malformed requests. */ }
        }
        lastFailure = undefined;
        const response = await (dependencies.fetch ?? globalThis.fetch)(input, { ...init, headers, signal: combined, redirect: "error" });
        if (combined?.aborted) { await response.body?.cancel(); combined.throwIfAborted(); }
        try { await assertCurrent(true, combined ?? undefined); } catch (error) { await response.body?.cancel(); throw error; }
        if (response.status === 401 || response.status === 403 || response.status >= 300 && response.status < 400) {
          await response.body?.cancel();
          throw new NativeQuickerMcpError(response.status === 401 ? "unauthorized" : response.status === 403 ? "consent-required" : "error");
        }
        return response;
      } catch (error) {
        combined?.throwIfAborted();
        if (!(error instanceof NativeQuickerMcpError)) await assertCurrent(true, combined ?? undefined);
        throw lastFailure = error instanceof NativeQuickerMcpError ? error : new NativeQuickerMcpError("error", true);
      }
    },
  };
}
