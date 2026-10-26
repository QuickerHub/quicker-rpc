import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import { currentQkrpcTarget, configuredQkrpcBinding, hasUnverifiedQkrpcRead, markUnverifiedQkrpcRead, bindQkrpcTarget, readHostBinding, isOfflineSourceInvoke, isQkrpcReadOnlyInvoke, bindingFailure, type QkrpcHostBinding } from "@/lib/qkrpc-host-binding";
import { argvToInvoke } from "@/lib/qkrpc-argv";
import { isQkrpcInvokeReplaySafe } from "@/lib/qkrpc-operation-effects";
import { parseQkrpcJson } from "@/lib/qkrpc-json";
import {
  isBundledAgentRuntime,
  resolveEffectiveWorkingDirectory,
} from "@/lib/default-working-directory";
import { getRequestCwd } from "@/lib/qkrpc-request-context";
import { resolveRequestAbortSignal } from "@/lib/request-abort-signal";
import { invokeQkrpcHttp, resolveQkrpcHttpBase } from "@/lib/qkrpc-http";
import {
  invalidateServeProbeCache,
  isCliTransportForced,
  isHttpTransportForced,
  mustNotSpawnCli,
} from "@/lib/qkrpc-transport";
import {
  isQkrpcBinMissingFailure,
  isQkrpcConnectivityFailure,
  QKRPC_BIN_MISSING_GUIDANCE,
  QKRPC_CONNECTIVITY_FAILURE_GUIDANCE,
  QKRPC_TRANSIENT_FAILURE_GUIDANCE,
} from "@/lib/qkrpc-connectivity";
import type { QkrpcRunResult } from "@/lib/qkrpc-types";
import {
  isQkrpcConnectivityBlockedThisTurn,
  markQkrpcConnectivityBlockedThisTurn,
} from "@/lib/qkrpc-connectivity-gate";
import { executeSingleQkrpcToolCall } from "@/lib/qkrpc-tool-call";
import type { ActionProjectBinding } from "./action-project-binding";

const require = createRequire(import.meta.url);
const {
  resolveQkrpcBin,
  resolveQkrpcFromPath,
  resolveUserInstalledQkrpcExe,
  resolveBundledQkrpcSourceDir,
} = require("./qkrpc-bin.mjs") as {
  resolveQkrpcBin: (agentGuiRoot: string) => string | null;
  resolveQkrpcFromPath: () => string | null;
  resolveUserInstalledQkrpcExe: () => string | null;
  resolveBundledQkrpcSourceDir: (agentGuiRoot: string) => string | null;
};

export type { QkrpcRunResult } from "@/lib/qkrpc-types";

export type QkrpcRunOptions = {
  /** Internal snapshot of an already selected CLI executable; null means unavailable. */
  binaryPath?: string | null;
  stdin?: string;
  timeoutMs?: number;
  json?: boolean;
  abortSignal?: AbortSignal;
  hostBinding?: QkrpcHostBinding;
  expectedProjectBinding?: ActionProjectBinding | null;
  projectDirectory?: string;
};

const MAX_STDOUT_CHARS = 120_000;
const QKRPC_EXE = process.platform === "win32" ? "qkrpc.exe" : "qkrpc";

export function resolveQkrpcCliBinary(options?: { readOnly?: boolean }): string | null {
  const configured = process.env.QKRPC_BIN?.trim();
  if (options?.readOnly && configured) return existsSync(configured) ? configured : null;
  if (configured && existsSync(configured)) {
    return configured;
  }

  const agentGuiRoot = resolveAgentGuiRoot();
  if (options?.readOnly) {
    // Knowledge reads may use existing artifacts, never stage files or reconcile a running serve.
    const staged = join(agentGuiRoot, ".runtime", "qkrpc", QKRPC_EXE);
    if (existsSync(staged)) return staged;
    const sourceDir = resolveBundledQkrpcSourceDir(agentGuiRoot);
    if (sourceDir) return join(sourceDir, QKRPC_EXE);
    return resolveUserInstalledQkrpcExe() ?? resolveQkrpcFromPath();
  }
  const resolved = resolveQkrpcBin(agentGuiRoot);
  if (resolved && existsSync(resolved)) {
    return resolved;
  }

  const userExe = resolveUserInstalledQkrpcExe() ?? resolveQkrpcFromPath();
  if (userExe) {
    return userExe;
  }

  if (!isBundledAgentRuntime()) {
    const staged = join(agentGuiRoot, ".runtime", "qkrpc", QKRPC_EXE);
    if (existsSync(staged)) {
      return staged;
    }
  }

  return null;
}

function formatQkrpcMissingMessage(): string {
  if (isBundledAgentRuntime()) {
    return [
      "找不到 qkrpc 可执行文件。",
      "请重新安装 QuickerAgent，或从 GitHub Releases 安装 qkrpc-win-x64-setup.exe；",
      "并确认 Quicker 已运行且已加载 QuickerRpc 插件。",
    ].join(" ");
  }
  return "找不到 qkrpc。请在 quicker-rpc 仓库根目录运行: pwsh ./build.ps1 -t，或安装 qkrpc CLI 到 %LOCALAPPDATA%\\Programs\\qkrpc\\。";
}

function formatOpNotOnServeMessage(args: string[]): string {
  const cmd = args.filter((a) => a !== "--json").join(" ");
  return [
    `命令未通过 qkrpc serve 暴露，无法执行: ${cmd}`,
    "请升级 qkrpc / QuickerAgent，或设置 QKRPC_TRANSPORT=cli 强制子进程（仅调试）。",
  ].join(" ");
}

function formatServeUnreachableMessage(): string {
  return [
    `无法连接 qkrpc serve（${resolveQkrpcHttpBase()}）。`,
    "请确认 Quicker 已运行、QuickerRpc 插件已加载，且 serve 已启动。",
  ].join(" ");
}

function serveTransportError(stderr: string): QkrpcRunResult {
  return {
    ok: false,
    exitCode: 1,
    stdout: "",
    stderr,
    parsed: null,
    truncated: false,
  };
}

/** Validation error before spawning qkrpc (tool layer). */
export function qkrpcValidationError(stderr: string): QkrpcRunResult {
  return serveTransportError(stderr);
}

function formatSpawnError(err: Error, bin: string): string {
  if (!err.message.includes("ENOENT")) {
    return err.message;
  }
  if (isBundledAgentRuntime()) {
    return `spawn ${bin} ENOENT — ${formatQkrpcMissingMessage()}`;
  }
  return `${err.message}（开发环境请在仓库根目录运行: pwsh ./build.ps1 -t）`;
}

function resolveCwd(): string {
  const fromRequest = getRequestCwd()?.trim();
  if (fromRequest) {
    return fromRequest;
  }
  if (process.env.QKRPC_CWD?.trim()) {
    return process.env.QKRPC_CWD.trim();
  }
  return resolveEffectiveWorkingDirectory(undefined);
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_STDOUT_CHARS) {
    return { text, truncated: false };
  }
  const head = text.slice(0, MAX_STDOUT_CHARS);
  return {
    text: `${head}\n\n…[truncated ${text.length - MAX_STDOUT_CHARS} chars; narrow the query]`,
    truncated: true,
  };
}

function tryParseJson(stdout: string): unknown | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return parseQkrpcJson(trimmed);
  } catch {
    return null;
  }
}

function isActionQueryArgv(args: string[]): boolean {
  if (args[0] !== "action") return false;
  const verb = args[1];
  if (verb === "search") return true;
  if (verb !== "list") return false;
  return args.some((a, i) => a === "--query" && args[i + 1]?.trim());
}

function actionQueryMatchCount(parsed: unknown): number | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const root = parsed as Record<string, unknown>;
  const data =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;
  if (typeof data.matchCount === "number") return data.matchCount;
  if (Array.isArray(data.items)) return data.items.length;
  if (typeof data.count === "number") return data.count;
  return null;
}

function shouldRetryHttpActionQuery(args: string[], parsed: unknown): boolean {
  if (!isActionQueryArgv(args)) return false;
  const count = actionQueryMatchCount(parsed);
  return count === 0;
}

function isStepRunnerCatalogArgv(args: string[]): boolean {
  return args[0] === "step-runner" && (args[1] === "search" || args[1] === "get");
}

function readPayloadObject(parsed: unknown): Record<string, unknown> | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const root = parsed as Record<string, unknown>;
  const data =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;
  return data;
}

function readIconField(obj: Record<string, unknown>): string {
  const icon = obj.icon ?? obj.Icon;
  return typeof icon === "string" ? icon.trim() : "";
}

/** Stale qkrpc serve may omit icon on step-runner UI DTOs; retry via CLI spawn. */
function shouldRetryHttpStepRunnerMissingIcons(op: string, parsed: unknown): boolean {
  if (op !== "step-runner.search" && op !== "step-runner.getUi") return false;
  const payload = readPayloadObject(parsed);
  if (!payload) return false;

  if (op === "step-runner.getUi") {
    const schema = payload.schema ?? payload.Schema;
    if (typeof schema === "object" && schema !== null && !Array.isArray(schema)) {
      return readIconField(schema as Record<string, unknown>).length === 0;
    }
    const schemaJson = payload.schemaJson ?? payload.SchemaJson;
    if (typeof schemaJson === "string" && schemaJson.trim()) {
      try {
        const schemaObj = JSON.parse(schemaJson) as Record<string, unknown>;
        return readIconField(schemaObj).length === 0;
      } catch {
        return true;
      }
    }
    return true;
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) return false;
  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) continue;
    if (readIconField(raw as Record<string, unknown>).length > 0) return false;
  }
  return true;
}

async function tryHttpInvoke(
  args: string[],
  options?: Pick<QkrpcRunOptions, "timeoutMs" | "abortSignal" | "hostBinding" | "expectedProjectBinding" | "projectDirectory">,
  transport?: { serveOnly: boolean },
): Promise<QkrpcRunResult | "skip"> {
  const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
  abortSignal?.throwIfAborted();
  const serveOnly = transport?.serveOnly ?? false;
  const invoke = argvToInvoke(args);
  if (!invoke) {
    return serveOnly ? serveTransportError(formatOpNotOnServeMessage(args)) : "skip";
  }

  const httpResult = await invokeQkrpcHttp(options && (Object.hasOwn(options, "expectedProjectBinding") || options.projectDirectory)
    ? { ...invoke, args: { ...invoke.args,
      ...(Object.hasOwn(options, "expectedProjectBinding") ? { expectedProjectBinding: options.expectedProjectBinding } : {}),
      ...(options.projectDirectory ? { dir: options.projectDirectory } : {}),
    } } : invoke, {
    timeoutMs: options?.timeoutMs,
    abortSignal,
    hostBinding: options?.hostBinding,
  });
  abortSignal?.throwIfAborted();

  if (httpResult === null) {
    if (!isQkrpcInvokeReplaySafe(invoke) || currentQkrpcTarget() || options?.hostBinding)
      return bindingFailure("HOST_UNAVAILABLE", "The bound gateway is unavailable. No CLI fallback was attempted.");
    invalidateServeProbeCache();
    return serveOnly
      ? serveTransportError(formatServeUnreachableMessage())
      : "skip";
  }

  if (!isQkrpcInvokeReplaySafe(invoke) || currentQkrpcTarget() || options?.hostBinding) return httpResult;

  if (httpResult.ok) {
    if (shouldRetryHttpStepRunnerMissingIcons(invoke.op, httpResult.parsed)) {
      invalidateServeProbeCache();
      return "skip";
    }
    if (!shouldRetryHttpActionQuery(args, httpResult.parsed)) {
      return httpResult;
    }
    if (serveOnly || isHttpTransportForced()) {
      return httpResult;
    }
    invalidateServeProbeCache();
    return "skip";
  }

  if (isHttpTransportForced() || serveOnly) {
    return httpResult;
  }

  invalidateServeProbeCache();
  return "skip";
}

async function spawnQkrpcCli(
  finalArgs: string[],
  options?: QkrpcRunOptions,
  onProcessStart?: (started: boolean) => void,
): Promise<QkrpcRunResult> {
  const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
  abortSignal?.throwIfAborted();
  const bin = options && Object.hasOwn(options, "binaryPath") ? options.binaryPath : resolveQkrpcCliBinary();
  if (!bin) {
    onProcessStart?.(false);
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: formatQkrpcMissingMessage(),
      parsed: null,
      truncated: false,
    };
  }
  const cwd = resolveCwd();
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const useStdin = Boolean(options?.stdin);

  return new Promise((resolve, reject) => {
    abortSignal?.throwIfAborted();
    const childEnv = { ...process.env };
    // A persistent parent/serve environment never supplies another document's CAS expectation.
    delete childEnv.QKRPC_EXPECTED_PROJECT_BINDING;
    delete childEnv.QKRPC_EXPECTED_PROJECT_DIRECTORY;
    if (options && Object.hasOwn(options, "expectedProjectBinding")) childEnv.QKRPC_EXPECTED_PROJECT_BINDING = JSON.stringify(options.expectedProjectBinding);
    if (options?.projectDirectory) childEnv.QKRPC_EXPECTED_PROJECT_DIRECTORY = options.projectDirectory;
    const child = spawn(bin, finalArgs, {
      cwd,
      env: { ...childEnv, ...((options?.hostBinding ?? currentQkrpcTarget()?.binding)
        ? { QKRPC_HOST_BINDING: JSON.stringify(options?.hostBinding ?? currentQkrpcTarget()?.binding),
            QKRPC_HOST_SESSION: (options?.hostBinding ?? currentQkrpcTarget()?.binding)!.hostSessionId } : {}) },
      stdio: useStdin ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let spawned = false;
    child.once("spawn", () => { spawned = true; onProcessStart?.(true); });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let cancelling = false;
    const cleanup = () => {
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (settled || cancelling) return;
      cancelling = true;
      cleanup();
      try { child.kill("SIGKILL"); }
      catch {
        settled = true;
        reject(abortSignal?.reason);
      }
    };

    const timer = setTimeout(() => {
      if (settled || cancelling) return;
      if (abortSignal?.aborted) { onAbort(); return; }
      settled = true;
      cleanup();
      child.kill();
      resolve({
        ok: false,
        exitCode: -1,
        stdout: "",
        stderr: `qkrpc timed out after ${timeoutMs}ms`,
        parsed: null,
        truncated: false,
      });
    }, timeoutMs);
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    if (abortSignal?.aborted) onAbort();

    child.stdout?.on("data", (chunk: Buffer) => {
      if (settled || cancelling) return;
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (settled || cancelling) return;
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      if (!spawned) onProcessStart?.(false);
      settled = true;
      cleanup();
      if (cancelling) { reject(abortSignal?.reason); return; }
      resolve({
        ok: false,
        exitCode: -1,
        stdout: "",
        stderr: formatSpawnError(err, bin),
        parsed: null,
        truncated: false,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (cancelling) { reject(abortSignal?.reason); return; }
      const { text, truncated: wasTruncated } = truncate(stdout);
      const exitCode = code ?? 1;
      resolve({
        ok: exitCode === 0,
        exitCode,
        stdout: text,
        stderr: stderr.trim(),
        parsed: tryParseJson(text),
        truncated: wasTruncated,
      });
    });

    if (!settled && !cancelling && useStdin && options?.stdin) {
      child.stdin?.on("error", () => { /* The child may exit before consuming all input. */ });
      child.stdin?.write(options.stdin, "utf8");
      child.stdin?.end();
    }
  });
}

async function runBoundQkrpcCli(args: string[], options?: QkrpcRunOptions): Promise<QkrpcRunResult> {
  const invoke = argvToInvoke(args);
  if (!invoke || isOfflineSourceInvoke(invoke) || invoke.op.startsWith("guide.") || invoke.op === "wait")
    return spawnQkrpcCli(args, options);
  if (currentQkrpcTarget()?.gateway.startsWith("http") && !isQkrpcInvokeReplaySafe(invoke))
    return bindingFailure("HOST_BINDING_REQUIRED", "This operation belongs to the bound HTTP gateway. No CLI fallback was attempted.");
  let binding = options?.hostBinding ?? currentQkrpcTarget()?.binding;
  if (!binding) {
    const configured = configuredQkrpcBinding();
    if (configured && "exitCode" in configured) return configured;
    binding = configured;
  }
  if (!binding && invoke.op === "action.save") {
    const local = await spawnQkrpcCli([...args, "--dry-run"], options);
    options?.abortSignal?.throwIfAborted();
    if (!local.ok) return local;
    const payload = local.parsed as { hostBinding?: unknown; data?: { hostBinding?: unknown } } | null;
    binding = readHostBinding(payload?.hostBinding ?? payload?.data?.hostBinding);
    if (!binding) return bindingFailure("HOST_BINDING_REQUIRED", "This bundle has no verified host binding. Reopen explicitly.");
  }
  if (!binding && invoke.op !== "action.save") {
    if (hasUnverifiedQkrpcRead() && !isQkrpcReadOnlyInvoke(invoke) && !process.env.QKRPC_HOST_SESSION?.trim())
      return bindingFailure("HOST_BINDING_REQUIRED", "The previous read had no verified identity. Select a host explicitly before writing.");
    const discovered = await spawnQkrpcCli(["host", "list", "--json"], { ...options, timeoutMs: Math.min(options?.timeoutMs ?? 10_000, 10_000) });
    options?.abortSignal?.throwIfAborted();
    const selectedSession = process.env.QKRPC_HOST_SESSION?.trim();
    const candidates = ((discovered.parsed as { candidates?: unknown[] } | null)?.candidates ?? [])
      .map(readHostBinding).filter((b): b is QkrpcHostBinding => Boolean(b
        && (!selectedSession || b.hostSessionId === selectedSession)
        && (invoke.op !== "action.open" || b.capabilities["action.source.read"] === true)));
    if (candidates.length > 1) return bindingFailure("HOST_SELECTION_REQUIRED", "Multiple compatible hosts. Select a host session explicitly.");
    binding = candidates[0];
    if (!binding && selectedSession)
      return bindingFailure("HOST_UNAVAILABLE", "The selected CLI host session is unavailable or incompatible. No other host was selected.");
    if (!binding && !isQkrpcReadOnlyInvoke(invoke))
      return bindingFailure("HOST_BINDING_REQUIRED", "No verified CLI host binding. No write was sent.");
  }
  if (binding) {
    try { bindQkrpcTarget({ gateway: currentQkrpcTarget()?.gateway ?? "cli", binding }); }
    catch (error) { return bindingFailure("HOST_BINDING_MISMATCH", error instanceof Error ? error.message : String(error)); }
  }
  let processStarted: boolean | undefined;
  const result = await spawnQkrpcCli(args, { ...options, hostBinding: binding }, (started) => { processStarted = started; });
  if (result.ok && !binding) markUnverifiedQkrpcRead();
  // Only a confirmed launch failure proves nothing ran; a missing spawn event alone does not.
  if (processStarted !== false && !isQkrpcInvokeReplaySafe(invoke) && result.parsed === null && (!result.ok || args.includes("--json")))
    return bindingFailure("WRITE_RESULT_UNKNOWN", `${result.stderr ? `${result.stderr}; ` : ""}The CLI operation result is unknown; inspect the bound host and local files before retrying.`);
  return result;
}

/** Direct qkrpc.exe spawn — qkrpc_wait recovery only (bypasses serve-only transport). */
export async function runQkrpcCliDirect(
  args: string[],
  options?: QkrpcRunOptions,
): Promise<QkrpcRunResult> {
  const json = options?.json !== false;
  const finalArgs = json && !args.includes("--json") ? [...args, "--json"] : [...args];
  return runBoundQkrpcCli(finalArgs, options);
}

export async function runQkrpc(
  args: string[],
  options?: QkrpcRunOptions,
): Promise<QkrpcRunResult> {
  const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
  abortSignal?.throwIfAborted();
  const serveOnly = currentQkrpcTarget()?.gateway === "cli" ? false : mustNotSpawnCli();
  const stepRunnerCatalog = isStepRunnerCatalogArgv(args);

  if (!options?.stdin && !isCliTransportForced() && currentQkrpcTarget()?.gateway !== "cli") {
    const http = await tryHttpInvoke(args, { ...options, abortSignal }, { serveOnly });
    abortSignal?.throwIfAborted();
    if (http !== "skip") {
      return http;
    }
  }

  if (serveOnly && !stepRunnerCatalog) {
    if (options?.stdin) {
      return serveTransportError(
        "stdin 模式不支持 qkrpc serve；请通过 HTTP 传入 JSON body（action.patch / replace 等）。",
      );
    }
    return serveTransportError(formatServeUnreachableMessage());
  }

  // Per-request qkrpc.exe subprocess — only when QKRPC_TRANSPORT=cli|spawn (local debug).
  const json = options?.json !== false;
  const finalArgs = json && !args.includes("--json") ? [...args, "--json"] : [...args];
  abortSignal?.throwIfAborted();
  return runBoundQkrpcCli(finalArgs, { ...options, abortSignal });
}

/** Drop legacy search-level agentGuidance (moved to docs / tool descriptions). */
function sanitizeQkrpcParsedForAgent(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return parsed;
  }
  const root = parsed as Record<string, unknown>;
  const action = root.action ?? root.Action;
  if (action !== "step-runner-search") {
    return parsed;
  }

  const next = { ...root };
  delete next.agentGuidance;
  delete next.AgentGuidance;

  const payload = next.payload ?? next.Payload;
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    const p = { ...(payload as Record<string, unknown>) };
    delete p.agentGuidance;
    delete p.AgentGuidance;
    next.payload = p;
  }

  return next;
}

export function formatQkrpcResult(result: QkrpcRunResult): Record<string, unknown> {
  const data =
    result.parsed != null
      ? sanitizeQkrpcParsedForAgent(result.parsed)
      : result.stdout;
  return {
    ok: result.ok,
    exitCode: result.exitCode,
    source: "qkrpc",
    data,
    stderr: result.stderr || undefined,
    truncated: result.truncated || undefined,
  };
}

/** Preserve a single read's receipt; Ask cannot use the Agent recovery tool. */
export function formatQkrpcReadOnlyGetResultForAgent(result: QkrpcRunResult): Record<string, unknown> {
  const formatted = formatQkrpcResult(result);
  if (result.ok) return formatted;
  const payload = result.parsed && typeof result.parsed === "object" && !Array.isArray(result.parsed)
    ? result.parsed as Record<string, unknown> : undefined;
  const blocked = payload?.status === "connectivity_blocked";
  const connectivity = blocked || isQkrpcConnectivityFailure(result) || payload?.error === "HOST_UNAVAILABLE";
  const guidance = connectivity
    ? "Ask will not start or repair Quicker or serve. Start and connect the selected Quicker host/plugin manually, or switch to Agent mode for recovery. The existing host binding is preserved."
    : "This read failed after one attempt. Ask did not retry or start Quicker or serve; inspect the original error before choosing the next action.";
  const data = formatted.data;
  return {
    ...formatted,
    data: data && typeof data === "object" && !Array.isArray(data)
      ? { ...data, ...(blocked ? { message: "Read blocked after an earlier connection failure; no connection was attempted." } : {}), guidance }
      : data,
    // The gate's old stderr is operational advice, not a native host receipt.
    ...(blocked ? { stderr: "Ask read blocked after an earlier connection failure; no automatic recovery was attempted." } : {}),
    summary: guidance,
    retryable: false,
  };
}

async function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  try { await delay(ms, undefined, { signal: abortSignal }); }
  catch (error) { abortSignal?.throwIfAborted(); throw error; }
}

/** Failures worth retrying inside the tool (timeout / transient transport). */
export function isRetryableQkrpcFailure(result: QkrpcRunResult): boolean {
  if (result.ok) return false;
  const parsed = result.parsed as { error?: string; retryable?: boolean } | null;
  if (parsed?.retryable === false || /^(?:HOST_|WRITE_RESULT_UNKNOWN)/.test(parsed?.error ?? "")) return false;
  const stderr = (result.stderr ?? "").toLowerCase();
  if (stderr.includes("timed out") || stderr.includes("timeout")) return true;
  if (stderr.includes("aborted") || stderr.includes("abort")) return true;
  if (stderr.includes("econnrefused") || stderr.includes("fetch failed")) {
    return true;
  }
  if (result.exitCode === -1 && stderr.length > 0) return true;
  return false;
}

const QKRPC_TOOL_MAX_ATTEMPTS = 3;
const QKRPC_RETRY_BASE_DELAY_MS = 1_200;

/** One attempt with the tool connectivity gate; mutating source calls must not auto-retry. */
export function runQkrpcForToolOnce(args: string[], options?: QkrpcRunOptions): Promise<QkrpcRunResult> {
  const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
  return executeSingleQkrpcToolCall(args, { ...options, abortSignal }, {
    run: runQkrpc,
    isConnectivityBlocked: isQkrpcConnectivityBlockedThisTurn,
    markConnectivityBlocked: markQkrpcConnectivityBlockedThisTurn,
  });
}

/** Ask program reads cannot enter a serve pool that may bootstrap its connection. */
export function runQkrpcReadOnlyGetForTool(args: string[], options?: QkrpcRunOptions): Promise<QkrpcRunResult> {
  const invoke = argvToInvoke(args);
  if (invoke?.op !== "action.get" && invoke?.op !== "subprogram.get") {
    return Promise.resolve(qkrpcValidationError("Read-only program access only permits action get or subprogram get."));
  }
  const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
  const id = invoke.args.id;
  if (typeof id !== "string" || !id.trim()) return Promise.resolve(qkrpcValidationError("Program id is required."));
  // Rebuild the narrow command so a caller cannot override the connection-only flag.
  const readArgs = [invoke.op === "action.get" ? "action" : "subprogram", "get", "--id", id];
  if (typeof invoke.args.returnMode === "string") readArgs.push("--return-mode", invoke.args.returnMode);
  readArgs.push("--no-bootstrap");
  return executeSingleQkrpcToolCall(readArgs, { ...options, abortSignal }, {
    run: runQkrpcCliDirect,
    isConnectivityBlocked: isQkrpcConnectivityBlockedThisTurn,
    markConnectivityBlocked: markQkrpcConnectivityBlockedThisTurn,
  });
}

/**
 * Run qkrpc with in-tool retries for timeouts/transient errors.
 * Used by agent tools so the model does not immediately repeat the same call.
 */
export async function runQkrpcForTool(
  args: string[],
  options?: QkrpcRunOptions,
): Promise<QkrpcRunResult> {
  const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
  abortSignal?.throwIfAborted();

  const baseTimeout = options?.timeoutMs ?? 120_000;
  let last: QkrpcRunResult | null = null;

  for (let attempt = 1; attempt <= QKRPC_TOOL_MAX_ATTEMPTS; attempt++) {
    abortSignal?.throwIfAborted();
    const timeoutMs = baseTimeout + (attempt - 1) * 45_000;
    const result = await runQkrpcForToolOnce(args, { ...options, timeoutMs, abortSignal });
    abortSignal?.throwIfAborted();
    if (result.ok) return result;
    last = result;
    const invoke = argvToInvoke(args);
    if (!invoke || !isQkrpcInvokeReplaySafe(invoke) || isQkrpcConnectivityFailure(result)) {
      break;
    }
    if (!isRetryableQkrpcFailure(result) || attempt === QKRPC_TOOL_MAX_ATTEMPTS) {
      break;
    }
    await sleep(QKRPC_RETRY_BASE_DELAY_MS * attempt, abortSignal);
  }

  return last!;
}

/**
 * Map hard timeouts to a soft tool payload so the agent avoids identical retries.
 */
export function formatQkrpcResultForAgent(
  result: QkrpcRunResult,
): Record<string, unknown> {
  if (!result.ok && isQkrpcBinMissingFailure(result)) {
    const message = result.stderr?.trim() || "qkrpc CLI not found on PATH";
    return {
      ok: false,
      exitCode: result.exitCode,
      source: "qkrpc",
      data: {
        status: "bin_missing",
        message,
        guidance: QKRPC_BIN_MISSING_GUIDANCE,
      },
      stderr: result.stderr || undefined,
      truncated: result.truncated || undefined,
    };
  }

  if (!result.ok && isQkrpcConnectivityFailure(result)) {
    const message =
      result.stderr?.trim()
      || "QuickerRpc plugin or serve is not available";
    return {
      ok: false,
      exitCode: result.exitCode,
      source: "qkrpc",
      data: {
        status: "connectivity_failure",
        message,
        guidance: QKRPC_CONNECTIVITY_FAILURE_GUIDANCE,
      },
      stderr: result.stderr || undefined,
      truncated: result.truncated || undefined,
    };
  }

  if (!result.ok && isRetryableQkrpcFailure(result)) {
    const message =
      result.stderr?.trim()
      || "qkrpc did not finish in time after several attempts";
    return {
      ok: true,
      exitCode: 0,
      source: "qkrpc",
      data: {
        status: "transient_error",
        kind: message.toLowerCase().includes("timed out")
          ? "timeout"
          : "transport",
        message,
        guidance: QKRPC_TRANSIENT_FAILURE_GUIDANCE,
        attempts: QKRPC_TOOL_MAX_ATTEMPTS,
      },
    };
  }

  return formatQkrpcResult(result);
}

/** Inline JSON body ops supported by qkrpc serve (args key → CLI file flag). */
const HTTP_JSON_BODY_OPS: Record<string, { argKey: string; fileFlag: string }> = {
  "action.patch": { argKey: "patch", fileFlag: "patch-file" },
  "action.replace": { argKey: "xaction", fileFlag: "xaction-file" },
  "subprogram.patch": { argKey: "patch", fileFlag: "patch-file" },
  "subprogram.replace": { argKey: "program", fileFlag: "program-file" },
};

async function runQkrpcWithJsonPayloadOnce(
  baseArgs: string[],
  jsonObject: unknown,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<QkrpcRunResult> {
  abortSignal?.throwIfAborted();
  const fileFlags = new Set(
    Object.values(HTTP_JSON_BODY_OPS).map((entry) => `--${entry.fileFlag}`),
  );
  const filtered = baseArgs.filter((a) => !fileFlags.has(a));
  const invoke = argvToInvoke(filtered);
  const httpSpec = invoke ? HTTP_JSON_BODY_OPS[invoke.op] : undefined;

  const serveOnly = currentQkrpcTarget()?.gateway === "cli" ? false : mustNotSpawnCli();

  if (httpSpec && !isCliTransportForced() && currentQkrpcTarget()?.gateway !== "cli") {
    const httpResult = await invokeQkrpcHttp(
      {
        op: invoke!.op,
        args: { ...invoke!.args, [httpSpec.argKey]: jsonObject },
      },
      { timeoutMs, abortSignal },
    );
    abortSignal?.throwIfAborted();
    if (httpResult?.ok || (httpResult && !isQkrpcInvokeReplaySafe(invoke!))) {
      return httpResult!;
    }
    if (currentQkrpcTarget() || !isQkrpcInvokeReplaySafe(invoke!))
      return httpResult ?? bindingFailure("HOST_UNAVAILABLE", "The bound gateway is unavailable. No CLI fallback was attempted.");
    if (serveOnly) {
      return (
        httpResult
        ?? serveTransportError(formatServeUnreachableMessage())
      );
    }
    invalidateServeProbeCache();
  }

  if (serveOnly) {
    return serveTransportError(
      invoke
        ? formatServeUnreachableMessage()
        : formatOpNotOnServeMessage(filtered),
    );
  }

  const fileFlag = httpSpec?.fileFlag ?? "patch-file";
  abortSignal?.throwIfAborted();
  const dir = await mkdtemp(join(tmpdir(), "qkrpc-json-"));
  const file = join(dir, `${fileFlag.replace(/-/g, "_")}.json`);
  try {
    abortSignal?.throwIfAborted();
    await writeFile(file, JSON.stringify(jsonObject), "utf8");
    abortSignal?.throwIfAborted();
    return await runQkrpc([...baseArgs, `--${fileFlag}`, file], { timeoutMs, abortSignal });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runQkrpcWithJsonPayloadForTool(
  baseArgs: string[],
  jsonObject: unknown,
  options?: Pick<QkrpcRunOptions, "timeoutMs" | "abortSignal">,
): Promise<QkrpcRunResult> {
  const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
  abortSignal?.throwIfAborted();
  return runQkrpcWithJsonPayloadOnce(baseArgs, jsonObject, options?.timeoutMs ?? 120_000, abortSignal);
}

export async function runQkrpcWithPatchFile(
  baseArgs: string[],
  patchObject: unknown,
  options?: Pick<QkrpcRunOptions, "timeoutMs" | "abortSignal">,
): Promise<QkrpcRunResult> {
  return runQkrpcWithPatchFileForTool(baseArgs, patchObject, options);
}

export async function runQkrpcWithPatchFileForTool(
  baseArgs: string[],
  patchObject: unknown,
  options?: Pick<QkrpcRunOptions, "timeoutMs" | "abortSignal">,
): Promise<QkrpcRunResult> {
  return runQkrpcWithJsonPayloadForTool(baseArgs, patchObject, options);
}

export async function runQkrpcWithXactionForTool(
  baseArgs: string[],
  xactionObject: unknown,
  options?: Pick<QkrpcRunOptions, "timeoutMs" | "abortSignal">,
): Promise<QkrpcRunResult> {
  return runQkrpcWithJsonPayloadForTool(baseArgs, xactionObject, options);
}

export async function runQkrpcWithProgramForTool(
  baseArgs: string[],
  programObject: unknown,
  options?: Pick<QkrpcRunOptions, "timeoutMs" | "abortSignal">,
): Promise<QkrpcRunResult> {
  return runQkrpcWithJsonPayloadForTool(baseArgs, programObject, options);
}
