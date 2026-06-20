/** Client-safe designer open tool id. */

export const QKRPC_DESIGNER_OPEN_TOOL = "qkrpc_designer_open";

export type DesignerOpenTarget = "action" | "global_subprogram";

export function isQkrpcDesignerOpenTool(toolName: string): boolean {
  return toolName === QKRPC_DESIGNER_OPEN_TOOL;
}
