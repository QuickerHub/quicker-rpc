import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentEvalMockVerify } from "@/lib/agent-eval/types";

function resolveQkrpcExe(): string {
  const repoRoot = join(process.cwd(), "..");
  const candidates = [
    join(repoRoot, "publish", "cli-new", "qkrpc.exe"),
    join(repoRoot, "publish", "cli", "qkrpc.exe"),
  ];
  for (const exe of candidates) {
    if (existsSync(exe)) {
      return exe;
    }
  }

  const installed = join(
    process.env.LOCALAPPDATA ?? "",
    "Programs",
    "qkrpc",
    "qkrpc.exe",
  );
  if (existsSync(installed)) {
    return installed;
  }

  try {
    const found = execSync("where qkrpc", {
      encoding: "utf8",
      windowsHide: true,
    })
      .trim()
      .split(/\r?\n/)[0]
      ?.trim();
    if (found && existsSync(found)) {
      return found;
    }
  } catch {
    // fall through
  }

  throw new Error(
    "qkrpc.exe not found. Run build.ps1 -t or install qkrpc-win-x64-setup.exe.",
  );
}

function workspaceRoot(): string {
  return (
    process.env.QKRPC_WORKSPACE_ROOT?.trim()
    || process.env.QKRPC_CWD?.trim()
    || join(process.cwd(), "..")
  );
}

export function runMockVerify(options: {
  actionId: string;
  mockProfile: string;
  param?: string;
}): AgentEvalMockVerify {
  const qkrpcExe = resolveQkrpcExe();
  const cwd = workspaceRoot();
  const args = [
    "action",
    "run",
    "--id",
    options.actionId,
    "--mock",
    "--mock-profile",
    options.mockProfile,
    "--assert",
    "--json",
  ];
  if (options.param) {
    args.push("--param", options.param);
  }

  const result = spawnSync(qkrpcExe, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  let assertionsPassed: boolean | undefined;
  try {
    const parsed = JSON.parse((result.stdout ?? "").trim()) as {
      assertions?: { passed?: boolean };
    };
    assertionsPassed = parsed.assertions?.passed;
  } catch {
    assertionsPassed = undefined;
  }

  return {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    actionId: options.actionId,
    profileId: options.mockProfile,
    assertionsPassed,
  };
}
