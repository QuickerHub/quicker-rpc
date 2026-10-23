import { isQkrpcConnectivityFailure, QKRPC_CONNECTIVITY_FAILURE_GUIDANCE } from "@/lib/qkrpc-connectivity";
import type { QkrpcRunOptions } from "@/lib/qkrpc";
import type { QkrpcRunResult } from "@/lib/qkrpc-types";

export type QkrpcToolCallDependencies = {
  run: (args: string[], options: QkrpcRunOptions) => Promise<QkrpcRunResult>;
  isConnectivityBlocked: () => boolean;
  markConnectivityBlocked: () => void;
};

/** Preserve the turn gate while keeping offline source validation independent of the V1 host. */
export async function executeSingleQkrpcToolCall(
  args: string[],
  options: QkrpcRunOptions,
  dependencies: QkrpcToolCallDependencies,
): Promise<QkrpcRunResult> {
  options.abortSignal?.throwIfAborted();
  const operation = args[0]?.trim().toLowerCase();
  const dryRunMarkers = args.map((argument, index) => /^--dry-run(?:=|$)/i.test(argument) ? index : -1)
    .filter((index) => index >= 0);
  const dryRunIndex = dryRunMarkers[0] ?? -1;
  const dryRunValue = dryRunIndex < 0 ? undefined : args[dryRunIndex + 1];
  const dryRunEnabled = dryRunMarkers.length === 1 && args[dryRunIndex].toLowerCase() === "--dry-run"
    && (dryRunValue === undefined || dryRunValue.startsWith("--") || dryRunValue.toLowerCase() === "true");
  const offline = operation === "action" && args[1]?.trim().toLowerCase() === "save" && dryRunEnabled;
  if (dependencies.isConnectivityBlocked() && !offline && !["wait", "health", "ping"].includes(operation)) {
    return {
      ok: false, exitCode: 1, stdout: "", truncated: false,
      stderr: "qkrpc connectivity blocked this turn — call qkrpc_wait once, then retry the original tool.",
      parsed: { status: "connectivity_blocked", message: QKRPC_CONNECTIVITY_FAILURE_GUIDANCE },
    };
  }
  const result = await dependencies.run(args, options);
  options.abortSignal?.throwIfAborted();
  if (!offline && isQkrpcConnectivityFailure(result)) dependencies.markConnectivityBlocked();
  return result;
}
