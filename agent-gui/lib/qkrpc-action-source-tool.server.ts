import { createQkrpcActionSourceTools } from "@/lib/qkrpc-action-source-tool";
import { formatQkrpcResult, runQkrpcForToolOnce } from "@/lib/qkrpc";
import { resolveActionSourceDirectory } from "@/lib/action-source-directory.server";
import { rememberActionSourceDirectory } from "@/lib/action-source-read-guard.server";

const sourceTools = createQkrpcActionSourceTools({
  resolveDirectory: resolveActionSourceDirectory,
  rememberDirectory: rememberActionSourceDirectory,
  // Single attempt preserves ambiguous/partial write failures instead of retrying or softening them.
  run: async (args, options) => formatQkrpcResult(await runQkrpcForToolOnce(args, options)),
});

export const QKRPC_ACTION_OPEN_TOOL_DEF = sourceTools.qkrpc_action_open;
export const QKRPC_ACTION_SAVE_TOOL_DEF = sourceTools.qkrpc_action_save;
