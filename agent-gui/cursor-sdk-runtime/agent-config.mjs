import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSettingSources } from "./setting-sources.mjs";

const runtimeDir = dirname(fileURLToPath(import.meta.url));
const agentGuiRoot = dirname(runtimeDir);

export function resolveCursorSdkApiKey() {
  return process.env.CURSOR_API_KEY?.trim() || undefined;
}

export function requireCursorSdkApiKey() {
  const key = resolveCursorSdkApiKey();
  if (!key) {
    throw new Error(
      "CURSOR_API_KEY is not set. Add it in Cursor Dashboard → Integrations.",
    );
  }
  return key;
}

export function defaultModelId() {
  return process.env.CURSOR_SDK_MODEL?.trim() || "auto";
}

export function resolveRepoRoot() {
  return (
    process.env.QUICKER_RPC_REPO_ROOT?.trim()
    || join(agentGuiRoot, "..")
  );
}

export function resolveQkrpcExe() {
  const repo = resolveRepoRoot();
  const candidates = [
    join(repo, "publish", "cli-new", "qkrpc.exe"),
    join(repo, "publish", "cli", "qkrpc.exe"),
    join(process.env.LOCALAPPDATA ?? "", "Programs", "qkrpc", "qkrpc.exe"),
  ];
  for (const exe of candidates) {
    if (existsSync(exe)) {
      return exe;
    }
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

/** @param {{ cwd: string; modelId?: string; name?: string }} params */
export function quickerRpcAgentOptions(params) {
  const cwd = params.cwd?.trim() || resolveRepoRoot();
  const qkrpcExe = resolveQkrpcExe();
  const modelId = params.modelId?.trim() || defaultModelId();

  return {
    apiKey: requireCursorSdkApiKey(),
    model: { id: modelId },
    name: params.name ?? "quicker-agent-cursor-sdk",
    local: {
      cwd,
      settingSources: parseSettingSources(),
      autoReview: false,
    },
    mcpServers: {
      qkrpc: {
        type: "stdio",
        command: qkrpcExe,
        args: ["mcp"],
        env: {
          QKRPC_WORKSPACE_ROOT: cwd,
          QKRPC_CWD: cwd,
        },
      },
    },
  };
}
