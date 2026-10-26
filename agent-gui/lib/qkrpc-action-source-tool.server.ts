import { createQkrpcActionSourceTools } from "@/lib/qkrpc-action-source-tool";
import { formatQkrpcResult, runQkrpcForToolOnce } from "@/lib/qkrpc";
import { resolveActionSourceDirectory } from "@/lib/action-source-directory.server";
import { rememberActionSourceDirectory } from "@/lib/action-source-read-guard.server";
import { SourceDocumentOwnerError, withExternalSourceDocumentWrite } from "./source-document-owner.server";
import { formatLocalToolResult } from "./tool-result";

const sourceTools = createQkrpcActionSourceTools({
  resolveDirectory: resolveActionSourceDirectory,
  rememberDirectory: rememberActionSourceDirectory,
  // Single attempt preserves ambiguous/partial write failures instead of retrying or softening them.
  run: async (args, options) => {
    const directory = args[args.indexOf("--dir") + 1];
    try { return await withExternalSourceDocumentWrite(directory, async () => formatQkrpcResult(await runQkrpcForToolOnce(args, options)), true); }
    catch (error) {
      if (!(error instanceof SourceDocumentOwnerError)) throw error;
      return { ...formatLocalToolResult({ errorCode: error.code }, false, error.message, { retryable: false }) };
    }
  },
});

export const QKRPC_ACTION_OPEN_TOOL_DEF = sourceTools.qkrpc_action_open;
export const QKRPC_ACTION_SAVE_TOOL_DEF = sourceTools.qkrpc_action_save;
