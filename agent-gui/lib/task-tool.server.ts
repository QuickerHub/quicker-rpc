import "server-only";

import { generateText, stepCountIs, tool, type Tool, type ToolSet } from "ai";
import { z } from "zod";
import { getSubagent } from "@/lib/agent-defs/discover-core";
import { buildSubagentSystemPrompt } from "@/lib/agent-defs/subagent-system.server";
import { AGENT_MAX_STEPS } from "@/lib/chat-mode";
import {
  resolveChatModelForSelection,
  resolveLlmSelection,
} from "@/lib/llm";
import {
  getRequestCwd,
  getRequestLlmSelectionRaw,
  runWithTraceTaskInvocation,
} from "@/lib/qkrpc-request-context";
import { createRepairToolCallHandler } from "@/lib/repair-tool-call";
import { formatLocalToolResult } from "@/lib/tool-result";
import {
  selectSubagentTools,
  type TaskParentCapabilities,
} from "@/lib/task-tool-capabilities";
import type { TaskToolStepSummary } from "@/lib/task-tool-display";
import { TASK_TOOL } from "@/lib/task-tool-constants";

export { TASK_TOOL };

function summarizeSteps(
  steps: Array<{
    toolCalls?: Array<{ toolName: string }>;
    text?: string;
  }>,
): TaskToolStepSummary[] {
  return steps.map((step) => ({
    toolCalls: (step.toolCalls ?? []).map((tc) => tc.toolName),
    textPreview: (step.text ?? "").trim().slice(0, 200),
  }));
}

function readTaskString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function parseTaskToolInput(
  input: Record<string, unknown>,
): { agent: string; prompt: string } | null {
  const agent = readTaskString(
    input,
    "agent",
    "Agent",
    "subagent",
    "subagentName",
    "name",
  );
  const prompt = readTaskString(
    input,
    "prompt",
    "Prompt",
    "task",
    "message",
    "query",
  );
  if (!agent || !prompt) return null;
  return { agent, prompt };
}

export async function executeTaskTool(input: {
  agent?: string;
  prompt?: string;
}, parent?: TaskParentCapabilities): Promise<Record<string, unknown>> {
  parent?.abortSignal?.throwIfAborted();
  const parsed = parseTaskToolInput(input as Record<string, unknown>);
  if (!parsed) {
    return formatLocalToolResult(
      {
        action: "task",
        errorMessage: "agent and prompt are required",
      },
      false,
      "agent and prompt are required",
    );
  }
  const agentName = parsed.agent;
  const prompt = parsed.prompt;

  if (!parent) {
    return formatLocalToolResult(
      { action: "task", errorCode: "task_parent_runtime_required" },
      false,
      "Task runtime is not bound to parent capabilities",
    );
  }

  const cwd = getRequestCwd() ?? "";
  const subagent = await getSubagent(agentName, cwd);
  if (!subagent) {
    return formatLocalToolResult(
      {
        action: "task",
        errorMessage: `Unknown subagent: ${agentName}`,
      },
      false,
      `Unknown subagent: ${agentName}`,
    );
  }

  const selectionRaw = subagent.model ?? getRequestLlmSelectionRaw();
  const selection = resolveLlmSelection(selectionRaw, undefined);
  if (!selection) {
    return formatLocalToolResult(
      {
        action: "task",
        errorMessage: "LLM selection is not configured for subagent",
      },
      false,
      "LLM selection is not configured for subagent",
    );
  }

  let model;
  let modelId: string;
  try {
    ({ model, modelId } = await resolveChatModelForSelection(selection));
  } catch (e) {
    parent.abortSignal?.throwIfAborted();
    const message = e instanceof Error ? e.message : String(e);
    return formatLocalToolResult(
      { action: "task", errorMessage: message },
      false,
      message,
    );
  }

  const tools = selectSubagentTools(parent.tools, subagent.tools);
  const system = await buildSubagentSystemPrompt(subagent, cwd);

  try {
    const scoped = await runWithTraceTaskInvocation(parent.toolCallId ?? "task", subagent.name, () => generateText({
      model,
      system,
      prompt,
      tools,
      abortSignal: parent.abortSignal,
      experimental_repairToolCall: createRepairToolCallHandler(tools),
      stopWhen: stepCountIs(AGENT_MAX_STEPS),
    }));
    const result = scoped.value;

    const toolSummary = summarizeSteps(result.steps ?? []);
    return formatLocalToolResult({
      action: "task",
      success: true,
      agent: subagent.name,
      prompt,
      model: modelId,
      result: result.text,
      steps: result.steps?.length ?? 0,
      toolSummary,
      ...(scoped.traceRuns.length ? { traceRuns: scoped.traceRuns } : {}),
      ...(scoped.traceRefs.length ? { traceRefs: scoped.traceRefs } : {}),
    });
  } catch (e) {
    parent.abortSignal?.throwIfAborted();
    const message = e instanceof Error ? e.message : String(e);
    return formatLocalToolResult(
      { action: "task", errorMessage: message },
      false,
      message,
    );
  }
}

export const TASK_TOOL_DEF = tool({
  description:
    "Delegate a focused sub-task to a specialized subagent defined in .quicker/agents/. "
    + "Provide agent name (from system subagent catalog) and a clear prompt. "
    + "Subagent runs in isolated loop; returns final text + step summary. "
    + "NOT for main chat flow — use when a catalog subagent matches the task.",
  inputSchema: z.object({
    agent: z
      .string()
      .describe("Subagent name from ## Subagents catalog in system prompt"),
    subagent: z
      .string()
      .optional()
      .describe("Alias for agent"),
    prompt: z
      .string()
      .describe("Self-contained task description for the subagent"),
  }),
  execute: (input) =>
    executeTaskTool({
      agent: input.agent ?? input.subagent,
      prompt: input.prompt,
    }),
});

/** Bind only after the parent runtime has composed and filtered its capabilities. */
export function createTaskToolForParent(
  parentTools: () => ToolSet,
  definition: Tool = TASK_TOOL_DEF,
): Tool {
  return {
    ...definition,
    execute: (input, options) => executeTaskTool(
      input as { agent?: string; prompt?: string },
      { tools: parentTools(), abortSignal: options.abortSignal, toolCallId: options.toolCallId },
    ),
  } as Tool;
}
