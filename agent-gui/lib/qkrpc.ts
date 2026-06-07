import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import { argvToInvoke } from "@/lib/qkrpc-argv";
import {
  isBundledAgentRuntime,
  resolveEffectiveWorkingDirectory,
} from "@/lib/default-working-directory";
import { getRequestCwd } from "@/lib/qkrpc-request-context";
import { invokeQkrpcHttp, resolveQkrpcHttpBase } from "@/lib/qkrpc-http";
import {
  invalidateServeProbeCache,
  isCliTransportForced,
  isHttpTransportForced,
  mustNotSpawnCli,
} from "@/lib/qkrpc-transport";
import type { QkrpcRunResult } from "@/lib/qkrpc-types";

const require = createRequire(import.meta.url);
const {
  resolveQkrpcBin,
  resolveQkrpcFromPath,
  resolveUserInstalledQkrpcExe,
} = require("./qkrpc-bin.mjs") as {
  resolveQkrpcBin: (agentGuiRoot: string) => string | null;
  resolveQkrpcFromPath: () => string | null;
  resolveUserInstalledQkrpcExe: () => string | null;
};

export type { QkrpcRunResult } from "@/lib/qkrpc-types";

const MAX_STDOUT_CHARS = 120_000;
const QKRPC_EXE = process.platform === "win32" ? "qkrpc.exe" : "qkrpc";

function resolveBin(): string | null {
  const configured = process.env.QKRPC_BIN?.trim();
  if (configured && existsSync(configured)) {
    return configured;
  }

  const agentGuiRoot = resolveAgentGuiRoot();
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
    return JSON.parse(trimmed) as unknown;
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
  options?: { timeoutMs?: number },
  transport?: { serveOnly: boolean },
): Promise<QkrpcRunResult | "skip"> {
  const serveOnly = transport?.serveOnly ?? false;
  const invoke = argvToInvoke(args);
  if (!invoke) {
    return serveOnly ? serveTransportError(formatOpNotOnServeMessage(args)) : "skip";
  }

  const httpResult = await invokeQkrpcHttp(invoke, {
    timeoutMs: options?.timeoutMs,
  });

  if (httpResult === null) {
    invalidateServeProbeCache();
    return serveOnly
      ? serveTransportError(formatServeUnreachableMessage())
      : "skip";
  }

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

export async function runQkrpc(
  args: string[],
  options?: { stdin?: string; timeoutMs?: number; json?: boolean },
): Promise<QkrpcRunResult> {
  const serveOnly = mustNotSpawnCli();
  const stepRunnerCatalog = isStepRunnerCatalogArgv(args);

  if (!options?.stdin && !isCliTransportForced()) {
    const http = await tryHttpInvoke(args, options, { serveOnly });
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
  const bin = resolveBin();
  if (!bin) {
    const message = formatQkrpcMissingMessage();
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: message,
      parsed: null,
      truncated: false,
    };
  }
  const cwd = resolveCwd();
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const useStdin = Boolean(options?.stdin);

  return new Promise((resolve) => {
    const child = spawn(bin, finalArgs, {
      cwd,
      env: process.env,
      stdio: useStdin ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
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

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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
      clearTimeout(timer);
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

    if (useStdin && options?.stdin) {
      child.stdin?.write(options.stdin, "utf8");
      child.stdin?.end();
    }
  });
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Failures worth retrying inside the tool (timeout / transient transport). */
export function isRetryableQkrpcFailure(result: QkrpcRunResult): boolean {
  if (result.ok) return false;
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

/**
 * Run qkrpc with in-tool retries for timeouts/transient errors.
 * Used by agent tools so the model does not immediately repeat the same call.
 */
export async function runQkrpcForTool(
  args: string[],
  options?: { stdin?: string; timeoutMs?: number; json?: boolean },
): Promise<QkrpcRunResult> {
  const baseTimeout = options?.timeoutMs ?? 120_000;
  let last: QkrpcRunResult | null = null;

  for (let attempt = 1; attempt <= QKRPC_TOOL_MAX_ATTEMPTS; attempt++) {
    const timeoutMs = baseTimeout + (attempt - 1) * 45_000;
    const result = await runQkrpc(args, { ...options, timeoutMs });
    if (result.ok) return result;
    last = result;
    if (!isRetryableQkrpcFailure(result) || attempt === QKRPC_TOOL_MAX_ATTEMPTS) {
      break;
    }
    await sleep(QKRPC_RETRY_BASE_DELAY_MS * attempt);
  }

  return last!;
}

/**
 * Map hard timeouts to a soft tool payload so the agent avoids identical retries.
 */
export function formatQkrpcResultForAgent(
  result: QkrpcRunResult,
): Record<string, unknown> {
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
        guidance:
          "Do not immediately repeat this tool with the same arguments. "
          + "Wait, use a read-only check, narrow the query, or ask the user.",
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
): Promise<QkrpcRunResult> {
  const fileFlags = new Set(
    Object.values(HTTP_JSON_BODY_OPS).map((entry) => `--${entry.fileFlag}`),
  );
  const filtered = baseArgs.filter((a) => !fileFlags.has(a));
  const invoke = argvToInvoke(filtered);
  const httpSpec = invoke ? HTTP_JSON_BODY_OPS[invoke.op] : undefined;

  const serveOnly = mustNotSpawnCli();

  if (httpSpec && !isCliTransportForced()) {
    const httpResult = await invokeQkrpcHttp(
      {
        op: invoke!.op,
        args: { ...invoke!.args, [httpSpec.argKey]: jsonObject },
      },
      { timeoutMs },
    );
    if (httpResult?.ok) {
      return httpResult;
    }
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
  const dir = await mkdtemp(join(tmpdir(), "qkrpc-json-"));
  const file = join(dir, `${fileFlag.replace(/-/g, "_")}.json`);
  try {
    await writeFile(file, JSON.stringify(jsonObject), "utf8");
    return await runQkrpc([...baseArgs, `--${fileFlag}`, file], { timeoutMs });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runQkrpcWithJsonPayloadForTool(
  baseArgs: string[],
  jsonObject: unknown,
): Promise<QkrpcRunResult> {
  const baseTimeout = 120_000;
  let last: QkrpcRunResult | null = null;

  for (let attempt = 1; attempt <= QKRPC_TOOL_MAX_ATTEMPTS; attempt++) {
    const timeoutMs = baseTimeout + (attempt - 1) * 45_000;
    const result = await runQkrpcWithJsonPayloadOnce(
      baseArgs,
      jsonObject,
      timeoutMs,
    );
    if (result.ok) return result;
    last = result;
    if (!isRetryableQkrpcFailure(result) || attempt === QKRPC_TOOL_MAX_ATTEMPTS) {
      break;
    }
    await sleep(QKRPC_RETRY_BASE_DELAY_MS * attempt);
  }

  return last!;
}

export async function runQkrpcWithPatchFile(
  baseArgs: string[],
  patchObject: unknown,
): Promise<QkrpcRunResult> {
  return runQkrpcWithPatchFileForTool(baseArgs, patchObject);
}

export async function runQkrpcWithPatchFileForTool(
  baseArgs: string[],
  patchObject: unknown,
): Promise<QkrpcRunResult> {
  return runQkrpcWithJsonPayloadForTool(baseArgs, patchObject);
}

export async function runQkrpcWithXactionForTool(
  baseArgs: string[],
  xactionObject: unknown,
): Promise<QkrpcRunResult> {
  return runQkrpcWithJsonPayloadForTool(baseArgs, xactionObject);
}

export async function runQkrpcWithProgramForTool(
  baseArgs: string[],
  programObject: unknown,
): Promise<QkrpcRunResult> {
  return runQkrpcWithJsonPayloadForTool(baseArgs, programObject);
}
