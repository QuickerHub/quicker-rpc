import { tool } from "ai";
import { z } from "zod";
import { formatQkrpcResultForAgent, runQkrpc } from "@/lib/qkrpc";

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

export type QkrpcWaitToolInput = z.infer<typeof waitInputSchema>;

function buildWaitArgs(input: QkrpcWaitToolInput): string[] {
  const timeout = input.timeoutSeconds ?? 120;
  const interval = input.intervalSeconds ?? 2;
  const args = [
    "wait",
    "--timeout",
    String(timeout),
    "--interval",
    String(interval),
    "--json",
  ];
  if (input.noBootstrap) args.push("--no-bootstrap");
  return args;
}

export async function executeQkrpcWaitTool(
  input: QkrpcWaitToolInput,
): Promise<Record<string, unknown>> {
  const timeout = input.timeoutSeconds ?? 120;
  const args = buildWaitArgs(input);
  const result = await runQkrpc(args, {
    json: true,
    timeoutMs: timeout * 1000 + 20_000,
  });
  return formatQkrpcResultForAgent(result);
}

export const QKRPC_WAIT_TOOL_DEF = tool({
  description:
    "Wait until Quicker + QuickerRpc plugin is reachable (poll with timeout). "
    + "Use once when other qkrpc tools return connectivity_failure — NOT shell ping/probe/serve. "
    + "On success retry the original tool; on timeout tell the user to start Quicker/load plugin.",
  inputSchema: waitInputSchema,
  execute: async (input: QkrpcWaitToolInput) => executeQkrpcWaitTool(input),
});
