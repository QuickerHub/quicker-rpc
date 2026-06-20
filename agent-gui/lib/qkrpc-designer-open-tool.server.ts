import { tool } from "ai";
import { z } from "zod";
import { executeQkrpcActionIdTool } from "@/lib/qkrpc-action-tool.server";
import { executeQkrpcSubprogramIdTool } from "@/lib/qkrpc-subprogram-tool.server";
import { formatQkrpcResultForAgent, qkrpcValidationError } from "@/lib/qkrpc";
import {
  QKRPC_DESIGNER_OPEN_TOOL,
  type DesignerOpenTarget,
} from "@/lib/qkrpc-designer-open-tool";

const designerTargetSchema = z.enum(["action", "global_subprogram"]);

export type QkrpcDesignerOpenToolInput = {
  target: DesignerOpenTarget;
  id: string;
};

export async function executeQkrpcDesignerOpenTool(
  input: QkrpcDesignerOpenToolInput,
): Promise<Record<string, unknown>> {
  const id = input.id?.trim();
  if (!id) {
    return formatQkrpcResultForAgent(qkrpcValidationError("id is required"));
  }
  if (input.target === "action") {
    return executeQkrpcActionIdTool({ action: "edit", id });
  }
  return executeQkrpcSubprogramIdTool({ action: "edit", id });
}

export const QKRPC_DESIGNER_OPEN_TOOL_DEF = tool({
  description:
    "Open one action or global subprogram in Quicker desktop designer UI. "
    + "target=action requires action GUID; target=global_subprogram accepts id or name. "
    + "NOT program body edits — use workspace_program.",
  inputSchema: z.object({
    target: designerTargetSchema.describe(
      "action | global_subprogram — which Quicker designer to open",
    ),
    id: z
      .string()
      .describe("Action GUID (action) or subprogram id/name (global_subprogram)"),
  }),
  execute: async (input) => executeQkrpcDesignerOpenTool(input),
});

export { QKRPC_DESIGNER_OPEN_TOOL };
