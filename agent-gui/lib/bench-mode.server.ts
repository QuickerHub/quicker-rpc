import "server-only";

import { formatQkrpcResultForAgent, qkrpcValidationError } from "@/lib/qkrpc";
import { getRequestBenchMode } from "@/lib/qkrpc-request-context";

const BENCH_BLOCKED_TOOLS = new Set([
  "qkrpc_action_query",
  "qkrpc_action_get",
  "qkrpc_subprogram_query",
]);

export function rejectBenchModeTool(
  toolName: string,
): Record<string, unknown> | null {
  if (!getRequestBenchMode() || !BENCH_BLOCKED_TOOLS.has(toolName)) {
    return null;
  }
  return formatQkrpcResultForAgent(
    qkrpcValidationError(
      `${toolName} is disabled in QuickerBench mode. `
      + "Create a new action with qkrpc_action_create and edit via workspace_program; "
      + "do not search or read existing Quicker actions.",
    ),
  );
}
