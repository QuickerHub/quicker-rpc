import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentOptions } from "@cursor/sdk";
import { parseSettingSources } from "./setting-sources.js";

const srcDir = dirname(fileURLToPath(import.meta.url));

/** quicker-rpc repo root (scripts/sdk/src → ../../../). */
export const REPO_ROOT = join(srcDir, "..", "..", "..");

export function resolveQkrpcExe(): string {
  const candidates = [
    join(REPO_ROOT, "publish", "cli-new", "qkrpc.exe"),
    join(REPO_ROOT, "publish", "cli", "qkrpc.exe"),
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

export function workspaceRoot(): string {
  return (
    process.env.QKRPC_WORKSPACE_ROOT?.trim() ||
    process.env.QKRPC_CWD?.trim() ||
    REPO_ROOT
  );
}

export function requireApiKey(): string {
  const key = process.env.CURSOR_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "CURSOR_API_KEY is not set. Export it or run via scripts/Invoke-CursorSdk.ps1 after agent login.",
    );
  }
  return key;
}

export function defaultModelId(): string {
  return process.env.CURSOR_SDK_MODEL?.trim() || "auto";
}

/** Shared Agent.create options for quicker-rpc automation. */
export function quickerRpcAgentOptions(
  overrides: Partial<AgentOptions> = {},
): AgentOptions {
  const cwd = workspaceRoot();
  const qkrpcExe = resolveQkrpcExe();
  const settingSources = process.env.CURSOR_SDK_SETTING_SOURCES?.trim()
    ? parseSettingSources()
    : undefined;

  return {
    apiKey: requireApiKey(),
    model: { id: defaultModelId() },
    local: {
      cwd,
      ...(settingSources ? { settingSources } : {}),
      // Headless local SDK cannot prompt for MCP approval; qkrpc MCP is trusted here.
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
    ...overrides,
  };
}
