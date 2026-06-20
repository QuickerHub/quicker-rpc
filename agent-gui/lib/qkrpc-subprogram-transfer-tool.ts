/** Client-safe subprogram transfer tool id. */

export const QKRPC_SUBPROGRAM_TRANSFER_TOOL = "qkrpc_subprogram_transfer";

export type SubprogramTransferDirection = "export" | "import";

export function isQkrpcSubprogramTransferTool(toolName: string): boolean {
  return toolName === QKRPC_SUBPROGRAM_TRANSFER_TOOL;
}
