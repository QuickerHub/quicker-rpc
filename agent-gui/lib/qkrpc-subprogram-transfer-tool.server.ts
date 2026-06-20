import { tool } from "ai";
import { z } from "zod";
import { executeQkrpcSubprogramIdTool } from "@/lib/qkrpc-subprogram-tool.server";
import { formatQkrpcResultForAgent, qkrpcValidationError } from "@/lib/qkrpc";
import {
  QKRPC_SUBPROGRAM_TRANSFER_TOOL,
  type SubprogramTransferDirection,
} from "@/lib/qkrpc-subprogram-transfer-tool";

const transferDirectionSchema = z.enum(["export", "import"]);

export type QkrpcSubprogramTransferToolInput = {
  direction: SubprogramTransferDirection;
  id?: string;
  dir: string;
  expectedEditVersion?: number;
  force?: boolean;
};

export async function executeQkrpcSubprogramTransferTool(
  input: QkrpcSubprogramTransferToolInput,
): Promise<Record<string, unknown>> {
  const dir = input.dir?.trim();
  if (!dir) {
    return formatQkrpcResultForAgent(qkrpcValidationError("dir is required"));
  }

  if (input.direction === "export") {
    const id = input.id?.trim();
    if (!id) {
      return formatQkrpcResultForAgent(
        qkrpcValidationError("id is required when direction=export"),
      );
    }
    return executeQkrpcSubprogramIdTool({ action: "export", id, dir });
  }

  return executeQkrpcSubprogramIdTool({
    action: "import",
    dir,
    expectedEditVersion: input.expectedEditVersion,
    force: input.force,
  });
}

export const QKRPC_SUBPROGRAM_TRANSFER_TOOL_DEF = tool({
  description:
    "Export or import a global subprogram project directory. "
    + "direction=export: id + dir (output); direction=import: dir (source). "
    + "NOT embedded subprograms — workspace_program for body edits.",
  inputSchema: z.object({
    direction: transferDirectionSchema.describe("export | import"),
    id: z
      .string()
      .optional()
      .describe("Subprogram id or name — required for export"),
    dir: z.string().describe("Directory path (export destination or import source)"),
    expectedEditVersion: z
      .number()
      .int()
      .optional()
      .describe("import: expected editVersion on disk"),
    force: z
      .boolean()
      .optional()
      .describe("import: ignore editVersion conflict"),
  }),
  execute: async (input) => executeQkrpcSubprogramTransferTool(input),
});

export { QKRPC_SUBPROGRAM_TRANSFER_TOOL };
