import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invokeQkrpcHttp, resolveQkrpcHttpBase } from "@/lib/qkrpc-http";
import { runQkrpcCliDirect } from "@/lib/qkrpc";
import { isQkrpcConnectivityFailure } from "@/lib/qkrpc-connectivity";
import type { QkrpcRunResult } from "@/lib/qkrpc-types";

export type ActionRuntimeOp =
  | "run"
  | "check"
  | "keys"
  | "validate"
  | "mockRun"
  | "mockProfilesList";

const INVOKE_TIMEOUT_MS = 120_000;

function serveOpFor(op: ActionRuntimeOp): string {
  switch (op) {
    case "run":
      return "action.runtime.run";
    case "check":
      return "action.runtime.check";
    case "keys":
      return "action.runtime.keys";
    case "validate":
      return "action.validate";
    default:
      return "action.runtime.run";
  }
}

function formatServeUnavailableMessage(): string {
  return [
    `无法连接 qkrpc serve（${resolveQkrpcHttpBase()}）。`,
    "已尝试自动启动 serve 与 CLI 回退。",
    "请在仓库根目录运行: pwsh ./build.ps1 -t",
  ].join(" ");
}

function shouldFallbackToCli(result: QkrpcRunResult | null): boolean {
  if (result === null) {
    return true;
  }
  return isQkrpcConnectivityFailure(result);
}

function appendMockCliFlags(base: string[], args: Record<string, unknown>): string[] {
  const out = [...base];
  const profile =
    typeof args.mockProfile === "string" && args.mockProfile.trim()
      ? args.mockProfile.trim()
      : undefined;
  if (profile) {
    out.push("--mock-profile", profile);
  }
  if (args.assert !== false) {
    out.push("--assert");
  }
  if (typeof args.param === "string" && args.param.trim()) {
    out.push("--param", args.param.trim());
  }
  if (typeof args.id === "string" && args.id.trim()) {
    out.push("--id", args.id.trim());
  }
  return out;
}

function appendRuntimeCliFlags(base: string[], args: Record<string, unknown>): string[] {
  const out = [...base];
  if (typeof args.param === "string" && args.param.trim()) {
    out.push("--param", args.param.trim());
  }
  if (args.verboseHost === true) {
    out.push("--verbose-host");
  }
  if (typeof args.dir === "string" && args.dir.trim()) {
    out.push("--dir", args.dir.trim());
  }
  if (typeof args.id === "string" && args.id.trim()) {
    out.push("--id", args.id.trim());
  }
  return out;
}

async function runWithXactionFile(
  baseArgs: string[],
  xaction: unknown,
  timeoutMs: number,
): Promise<QkrpcRunResult> {
  const dir = await mkdtemp(join(tmpdir(), "qkrpc-ar-"));
  const file = join(dir, "xaction.json");
  try {
    await writeFile(file, JSON.stringify(xaction), "utf8");
    // Must await: without it, finally deletes the temp file before qkrpc reads it.
    return await runQkrpcCliDirect([...baseArgs, "--xaction-file", file], { timeoutMs });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function invokeActionRuntimeCli(
  op: ActionRuntimeOp,
  args: Record<string, unknown>,
  timeoutMs = INVOKE_TIMEOUT_MS,
): Promise<QkrpcRunResult> {
  switch (op) {
    case "keys":
      return runQkrpcCliDirect(["action", "runtime-keys"], { timeoutMs });
    case "check": {
      const base = appendRuntimeCliFlags(["action", "runtime-check"], args);
      if (args.xaction !== undefined) {
        return runWithXactionFile(base, args.xaction, timeoutMs);
      }
      return runQkrpcCliDirect(base, { timeoutMs });
    }
    case "run": {
      const base = appendRuntimeCliFlags(["action", "run", "--standalone"], args);
      if (args.xaction !== undefined) {
        return runWithXactionFile(base, args.xaction, timeoutMs);
      }
      return runQkrpcCliDirect(base, { timeoutMs });
    }
    case "validate": {
      const base = ["action", "validate"];
      if (typeof args.workspaceRoot === "string" && args.workspaceRoot.trim()) {
        base.push("--workspace-root", args.workspaceRoot.trim());
      }
      if (typeof args.dir === "string" && args.dir.trim()) {
        base.push("--dir", args.dir.trim());
      }
      return runQkrpcCliDirect(base, { timeoutMs });
    }
    case "mockProfilesList":
      return runQkrpcCliDirect(["action", "mock-profiles", "list", "--json"], {
        timeoutMs,
      });
    case "mockRun": {
      const base = appendMockCliFlags(["action", "run", "--mock", "--json"], args);
      return runQkrpcCliDirect(base, { timeoutMs });
    }
    default:
      return {
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: `Unsupported ActionRuntime op: ${op}`,
        parsed: null,
        truncated: false,
      };
  }
}

export async function invokeActionRuntime(
  op: ActionRuntimeOp,
  args: Record<string, unknown>,
): Promise<QkrpcRunResult> {
  if (op === "mockProfilesList") {
    const httpResult = await invokeQkrpcHttp(
      { op: "action.mock.profiles.list", args: {} },
      { timeoutMs: INVOKE_TIMEOUT_MS },
    );
    if (httpResult?.ok || (httpResult && !shouldFallbackToCli(httpResult))) {
      return httpResult ?? {
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: formatServeUnavailableMessage(),
        parsed: null,
        truncated: false,
      };
    }
    return invokeActionRuntimeCli(op, args, INVOKE_TIMEOUT_MS);
  }

  if (op === "mockRun") {
    const mockArgs = {
      ...args,
      mock: true,
      assert: args.assert !== false,
    };
    const httpResult = await invokeQkrpcHttp(
      { op: "action.run", args: mockArgs },
      { timeoutMs: INVOKE_TIMEOUT_MS },
    );
    if (httpResult?.ok || (httpResult && !shouldFallbackToCli(httpResult))) {
      return httpResult ?? {
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: formatServeUnavailableMessage(),
        parsed: null,
        truncated: false,
      };
    }
    const cliResult = await invokeActionRuntimeCli(op, args, INVOKE_TIMEOUT_MS);
    if (cliResult.ok || cliResult.parsed != null) {
      return cliResult;
    }
    return {
      ...cliResult,
      stderr: cliResult.stderr?.trim() || formatServeUnavailableMessage(),
    };
  }

  const needsQuicker =
    typeof args.id === "string"
    && args.id.trim().length > 0
    && !args.xaction
    && typeof args.dir !== "string";

  if (needsQuicker) {
    const httpResult = await invokeQkrpcHttp(
      { op: serveOpFor(op), args },
      { timeoutMs: INVOKE_TIMEOUT_MS },
    );
    if (httpResult?.ok || (httpResult && !shouldFallbackToCli(httpResult))) {
      return httpResult ?? {
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: formatServeUnavailableMessage(),
        parsed: null,
        truncated: false,
      };
    }
  }

  // Inline JSON / dir fixtures do not need Quicker; CLI is fastest in dev.
  const cliResult = await invokeActionRuntimeCli(op, args, INVOKE_TIMEOUT_MS);
  if (cliResult.ok || cliResult.parsed != null) {
    return cliResult;
  }

  const httpResult = await invokeQkrpcHttp(
    { op: serveOpFor(op), args },
    { timeoutMs: 15_000 },
  );

  if (httpResult?.ok) {
    return httpResult;
  }

  if (httpResult && !shouldFallbackToCli(httpResult)) {
    return httpResult;
  }

  return {
    ...cliResult,
    stderr: cliResult.stderr?.trim() || formatServeUnavailableMessage(),
  };
}
