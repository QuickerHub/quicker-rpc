import "server-only";

import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getSubagent } from "@/lib/agent-defs/discover-core";
import { AGENT_MAX_STEPS } from "@/lib/chat-mode";
import {
  resolveChatModelForSelection,
  resolveLlmSelection,
} from "@/lib/llm";
import {
  getRequestCwd,
  getRequestLlmSelectionRaw,
} from "@/lib/qkrpc-request-context";
import { createRepairToolCallHandler } from "@/lib/repair-tool-call";
import { formatLocalToolResult } from "@/lib/tool-result";
import { pickEnabledTools } from "@/lib/tool-registry";
import { quickerTools } from "@/lib/tools";
import type { TaskToolStepSummary } from "@/lib/task-tool-display";
import { TASK_TOOL } from "@/lib/task-tool-constants";

export { TASK_TOOL };

function buildSubagentTools(allowedToolIds: string[] | undefined) {
  const base = { ...quickerTools };
  delete (base as Record<string, unknown>)[TASK_TOOL];
  if (!allowedToolIds?.length) {
    return base;
  }
  return pickEnabledTools(base, allowedToolIds);
}

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

export async function executeTaskTool(input: {
  agent: string;
  prompt: string;
}): Promise<Record<string, unknown>> {
  const agentName = input.agent.trim();
  const prompt = input.prompt.trim();
  if (!agentName || !prompt) {
    return formatLocalToolResult(
      {
        action: "task",
        errorMessage: "agent and prompt are required",
      },
      false,
      "agent and prompt are required",
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
    const message = e instanceof Error ? e.message : String(e);
    return formatLocalToolResult(
      { action: "task", errorMessage: message },
      false,
      message,
    );
  }

  const tools = buildSubagentTools(subagent.tools);
  const systemParts = [subagent.body.trim() || subagent.description];
  if (cwd) {
    systemParts.push(
      "",
      "## cwd",
      `qkrpc cwd: ${cwd}`,
      `Scratch/temp path: \`${cwd}/.local/\` (create as needed; gitignored).`,
    );
  }

  try {
    const result = await generateText({
      model,
      system: systemParts.join("\n"),
      prompt,
      tools,
      experimental_repairToolCall: createRepairToolCallHandler(tools),
      stopWhen: stepCountIs(AGENT_MAX_STEPS),
    });

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
    });
  } catch (e) {
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
    prompt: z
      .string()
      .describe("Self-contained task description for the subagent"),
  }),
  execute: executeTaskTool,
});
