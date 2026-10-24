import {
  executeTool,
  safeValidateTypes,
  type Tool,
  type ToolExecutionOptions,
} from "@ai-sdk/provider-utils";
import { generateId } from "ai";
import { randomUUID } from "node:crypto";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";
import { allQuickerTools } from "@/lib/tools";
import { qkrpcRequestContext, runWithAgentRequestContextAsync } from "@/lib/qkrpc-request-context";
import { createTurnExecutionState, disposeTurnExecutionState } from "@/lib/agent-harness/turn-execution-state";
import { currentQkrpcTarget } from "@/lib/qkrpc-host-binding";
import { resolveRequestAbortSignal } from "@/lib/request-abort-signal";
import {
  normalizeToolCallName,
  resolveKnownToolName,
} from "@/lib/repair-tool-call";
import { createTaskToolForParent, TASK_TOOL } from "@/lib/task-tool.server";

export type DirectToolExecuteResult =
  | { ok: true; output: unknown }
  | { ok: false; error: string; details?: unknown }
  | { needsApproval: true; toolName: string; message: string };

function resolveTool(toolName: string): Tool | undefined {
  const tools = allQuickerTools as Record<string, Tool>;
  const ids = Object.keys(tools);
  const canonical =
    resolveKnownToolName(toolName, ids) ?? normalizeToolCallName(toolName);
  return tools[canonical] ?? tools[toolName.trim()];
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
  abortSignal?: AbortSignal;
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
  // The direct test fixture is text-only and receives no ambient capabilities.
  const executionTool = toolName === TASK_TOOL && (input as { agent?: string }).agent === "tool-test-echo"
    ? createTaskToolForParent(() => ({}), tool)
    : tool;
  const toolCallId = params.toolCallId?.trim() || generateId();

  const needsApproval = await resolveNeedsApproval(executionTool, input, toolCallId);
  if (needsApproval && !params.approved) {
    return {
      needsApproval: true,
      toolName,
      message: "此工具需要确认后才能执行",
    };
  }

  const cwd = resolveEffectiveWorkingDirectory(params.workingDirectory);
  const options: ToolExecutionOptions = { toolCallId, messages: [] };
  const executionId = randomUUID();
  const executionState = createTurnExecutionState();
  executionState.qkrpcTarget = currentQkrpcTarget();
  const abortSignal = resolveRequestAbortSignal(params.abortSignal);
  options.abortSignal = abortSignal;

  try {
    const output = await qkrpcRequestContext.run({ ...qkrpcRequestContext.getStore(), executionState,
      traceInvocationPath: [], traceRuns: [], traceRefs: [],
      traceExecution: { executionId, createRunId: randomUUID, emit() {} },
    }, () => runWithAgentRequestContextAsync({ cwd, executionState, abortSignal, threadId: `direct:${executionId}` }, async () => {
      abortSignal?.throwIfAborted();
      let final: unknown;
      for await (const chunk of executeTool({
        execute: executionTool.execute!,
        input,
        options,
      })) {
        if (chunk.type === "final") {
          final = chunk.output;
        }
      }
      return final;
    }));
    return { ok: true, output };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  } finally {
    disposeTurnExecutionState(executionState);
  }
}
