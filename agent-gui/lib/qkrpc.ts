import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { argvToInvoke } from "@/lib/qkrpc-argv";
import { getRequestCwd } from "@/lib/qkrpc-request-context";
import { invokeQkrpcHttp } from "@/lib/qkrpc-http";
import {
  invalidateServeProbeCache,
  isCliTransportForced,
  isHttpTransportForced,
  shouldUseHttpTransport,
} from "@/lib/qkrpc-transport";
import type { QkrpcRunResult } from "@/lib/qkrpc-types";

const require = createRequire(import.meta.url);
const { resolveQkrpcBin, resolveUserInstalledQkrpcExe } = require("./qkrpc-bin.mjs") as {
  resolveQkrpcBin: (agentGuiRoot: string) => string | null;
  resolveUserInstalledQkrpcExe: () => string | null;
};

export type { QkrpcRunResult } from "@/lib/qkrpc-types";

const MAX_STDOUT_CHARS = 120_000;
const AGENT_GUI_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveBin(): string {
  const resolved = resolveQkrpcBin(AGENT_GUI_ROOT);
  if (resolved && existsSync(resolved)) {
    return resolved;
  }
  const userExe = resolveUserInstalledQkrpcExe();
  if (userExe) {
    return userExe;
  }
  return join(AGENT_GUI_ROOT, ".runtime", "qkrpc", "qkrpc.exe");
}

function resolveCwd(): string {
  const fromRequest = getRequestCwd()?.trim();
  if (fromRequest) {
    return fromRequest;
  }
  if (process.env.QKRPC_CWD?.trim()) {
    return process.env.QKRPC_CWD.trim();
  }
  const cwd = process.cwd();
  if (basename(cwd) === "agent-gui") {
    return join(cwd, "..");
  }
  return cwd;
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

async function tryHttpInvoke(
  args: string[],
  options?: { timeoutMs?: number },
): Promise<QkrpcRunResult | "skip"> {
  const invoke = argvToInvoke(args);
  if (!invoke) {
    return "skip";
  }

  const httpResult = await invokeQkrpcHttp(invoke, {
    timeoutMs: options?.timeoutMs,
  });

  if (httpResult === null) {
    invalidateServeProbeCache();
    return "skip";
  }

  if (httpResult.ok && !shouldRetryHttpActionQuery(args, httpResult.parsed)) {
    return httpResult;
  }

  if (httpResult.ok && shouldRetryHttpActionQuery(args, httpResult.parsed)) {
    invalidateServeProbeCache();
    return "skip";
  }

  if (isHttpTransportForced()) {
    return httpResult;
  }

  invalidateServeProbeCache();
  return "skip";
}

export async function runQkrpc(
  args: string[],
  options?: { stdin?: string; timeoutMs?: number; json?: boolean },
): Promise<QkrpcRunResult> {
  if (!options?.stdin && !isCliTransportForced()) {
    const useHttp = await shouldUseHttpTransport();
    if (useHttp) {
      const http = await tryHttpInvoke(args, options);
      if (http !== "skip") {
        return http;
      }
    }
  }

  const json = options?.json !== false;
  const finalArgs = json && !args.includes("--json") ? [...args, "--json"] : [...args];
  const bin = resolveBin();
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
      const hint = err.message.includes("ENOENT")
        ? `${err.message} (run pwsh ../build.ps1 -t from repo root)`
        : err.message;
      resolve({
        ok: false,
        exitCode: -1,
        stdout: "",
        stderr: hint,
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

export function formatQkrpcResult(result: QkrpcRunResult): Record<string, unknown> {
  return {
    ok: result.ok,
    exitCode: result.exitCode,
    source: "qkrpc",
    data: result.parsed ?? result.stdout,
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

  if (httpSpec && !isCliTransportForced()) {
    const useHttp = await shouldUseHttpTransport();
    if (useHttp) {
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
      invalidateServeProbeCache();
    }
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
