import type { QkrpcRunResult } from "@/lib/qkrpc-types";

/** Cursor / shell: qkrpc not on PATH — load workspace terminal env first. */
export const QKRPC_BIN_MISSING_GUIDANCE =
  "qkrpc CLI is not available in this shell PATH (shell_exec should auto-prepend qkrpc dirs). "
  + "Tell the user to run build.ps1 -t or install qkrpc-win-x64-setup.exe, "
  + "or use qkrpc MCP tools. Do NOT run random install or probe commands.";

/** Shown in tool payloads when Quicker / plugin / serve is unavailable. */
export const QKRPC_CONNECTIVITY_FAILURE_GUIDANCE =
  "QuickerRpc is unavailable. Call qkrpc_wait once (poll until ready), then retry the original tool. "
  + "If still failing, tell the user to start Quicker, load the QuickerRpc plugin, "
  + "and ensure qkrpc serve is running (agent-gui header shows RPC status). "
  + "Do NOT use shell_exec to ping, probe ports, start serve, hot-update (build.ps1 -t), "
  + "or re-run qkrpc CLI — or wait for the user to fix the environment.";

export const QKRPC_TRANSIENT_FAILURE_GUIDANCE =
  "Do not immediately repeat this tool with the same arguments. "
  + "Wait briefly, narrow the query, or ask the user. "
  + "Do NOT use shell_exec for connectivity checks or qkrpc CLI workarounds.";

function extractErrorCode(parsed: unknown): string {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "";
  }
  const error = (parsed as Record<string, unknown>).error;
  return typeof error === "string" ? error.trim().toLowerCase() : "";
}

/** True when failure is due to missing plugin, pipe, or serve — not a bad argument. */
export function isQkrpcConnectivityFailure(result: QkrpcRunResult): boolean {
  if (result.ok) return false;

  const errorCode = extractErrorCode(result.parsed);
  if (errorCode === "plugin_not_running") return true;
  if (errorCode === "wait_timeout") return true;

  const stderr = (result.stderr ?? "").toLowerCase();
  if (stderr.includes("插件未运行") || stderr.includes("命名管道不可用")) {
    return true;
  }
  if (stderr.includes("health check failed")) return true;
  if (stderr.includes("qkrpc serve returned invalid json")) return true;
  if (
    stderr.includes("econnrefused")
    || stderr.includes("fetch failed")
    || stderr.includes("enotfound")
  ) {
    return true;
  }
  if (
    stderr.includes("quicker") && stderr.includes("plugin")
    && (stderr.includes("load") || stderr.includes("加载") || stderr.includes("运行"))
  ) {
    return true;
  }

  return false;
}

/** True when qkrpc.exe cannot be spawned (PATH / QKRPC_BIN), not plugin connectivity. */
export function isQkrpcBinMissingFailure(result: QkrpcRunResult): boolean {
  if (result.ok) return false;
  const stderr = (result.stderr ?? "").toLowerCase();
  if (stderr.includes("enoent")) return true;
  if (stderr.includes("找不到 qkrpc")) return true;
  if (stderr.includes("qkrpc executable") && stderr.includes("not found")) return true;
  return false;
}
