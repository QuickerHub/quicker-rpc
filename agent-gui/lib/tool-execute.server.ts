import {
  executeTool,
  safeValidateTypes,
  type Tool,
  type ToolExecutionOptions,
} from "@ai-sdk/provider-utils";
import { generateId } from "ai";
import { quickerTools } from "@/lib/tools";
import { runWithAgentRequestContextAsync } from "@/lib/qkrpc-request-context";

export type DirectToolExecuteResult =
  | { ok: true; output: unknown }
  | { ok: false; error: string; details?: unknown }
  | { needsApproval: true; toolName: string; message: string };

function resolveTool(toolName: string): Tool | undefined {
  const tools = quickerTools as Record<string, Tool>;
  return tools[toolName];
}

async function resolveNeedsApproval(
  tool: Tool,
  input: unknown,
  toolCallId: string,
): Promise<boolean> {
  const flag = tool.needsApproval;
  if (flag === undefined) return false;
  if (typeof flag === "boolean") return flag;
  return flag(input, { toolCallId, messages: [] });
}

export async function executeQuickerToolDirect(params: {
  toolName: string;
  input: unknown;
  workingDirectory?: string;
  approved?: boolean;
  toolCallId?: string;
}): Promise<DirectToolExecuteResult> {
  const toolName = params.toolName?.trim();
  if (!toolName) {
    return { ok: false, error: "toolName is required" };
  }

  const tool = resolveTool(toolName);
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${toolName}` };
  }

  if (!tool.execute) {
    return { ok: false, error: `Tool "${toolName}" has no execute handler` };
  }

  const validated = await safeValidateTypes({
    value: params.input ?? {},
    schema: tool.inputSchema,
  });
  if (!validated.success) {
    return {
      ok: false,
      error: validated.error.message,
      details: validated.error,
    };
  }

  const input = validated.value;
  const toolCallId = params.toolCallId?.trim() || generateId();

  const needsApproval = await resolveNeedsApproval(tool, input, toolCallId);
  if (needsApproval && !params.approved) {
    return {
      needsApproval: true,
      toolName,
      message: "此工具需要确认后才能执行",
    };
  }

  const cwd = params.workingDirectory?.trim() || undefined;
  const options: ToolExecutionOptions = { toolCallId, messages: [] };

  try {
    const output = await runWithAgentRequestContextAsync({ cwd }, async () => {
      let final: unknown;
      for await (const chunk of executeTool({
        execute: tool.execute!,
        input,
        options,
      })) {
        if (chunk.type === "final") {
          final = chunk.output;
        }
      }
      return final;
    });
    return { ok: true, output };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
