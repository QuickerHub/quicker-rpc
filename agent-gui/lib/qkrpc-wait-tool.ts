import { tool } from "ai";
import { z } from "zod";
import { buildWaitCliArgs, executeRobustQkrpcWait } from "@/lib/qkrpc-wait-core";
import { clearQkrpcConnectivityBlockedThisTurn } from "@/lib/qkrpc-connectivity-gate";
import type { QkrpcWaitToolInput as QkrpcWaitInput } from "@/lib/qkrpc-wait-core";

export const QKRPC_WAIT_TOOL = "qkrpc_wait";

const waitInputSchema = z.object({
  timeoutSeconds: z
    .number()
    .int()
    .min(5)
    .max(600)
    .optional()
    .describe("Max wait in seconds (default 120)."),
  intervalSeconds: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .describe("Poll interval in seconds (default 2)."),
  noBootstrap: z
    .boolean()
    .optional()
    .describe("Do not auto-start plugin via quicker:runaction."),
});

export type QkrpcWaitToolInput = QkrpcWaitInput;

export async function executeQkrpcWaitTool(
  input: QkrpcWaitToolInput,
): Promise<Record<string, unknown>> {
  const result = await executeRobustQkrpcWait(input);
  if (result.ok === true) {
    clearQkrpcConnectivityBlockedThisTurn();
  }
  return result;
}

export const QKRPC_WAIT_TOOL_DEF = tool({
  description:
    "Wait until Quicker + QuickerRpc plugin is reachable (poll with timeout). "
    + "Auto-recovers: restarts qkrpc serve if down, polls via HTTP, then CLI with quicker:runaction bootstrap. "
    + "Use once when other qkrpc tools return connectivity_failure — NOT shell ping/probe/serve. "
    + "On success retry the original tool; on timeout tell the user to start Quicker/load plugin.",
  inputSchema: waitInputSchema,
  execute: async (input: QkrpcWaitToolInput) => executeQkrpcWaitTool(input),
});

export { buildWaitCliArgs } from "@/lib/qkrpc-wait-core";
