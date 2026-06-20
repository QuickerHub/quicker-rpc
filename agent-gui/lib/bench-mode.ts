import type { UIMessage } from "ai";
import { isQkrpcActionCreateTool } from "@/lib/qkrpc-action-tool";
import { parseActionIdFromSyncedToolOutput } from "@/lib/action-projects";
import { isStructuredToolResult } from "@/lib/tool-result";

/** Bench mode hides exploration tools — tasks use mock HTTP/fixtures. */
export const BENCH_MODE_EXCLUDED_TOOL_IDS: readonly string[] = [
  "web_search",
  "browser",
  "user_browser",
  "task",
];

export function isBenchModeExcludedTool(toolId: string): boolean {
  return BENCH_MODE_EXCLUDED_TOOL_IDS.includes(toolId);
}

export function filterToolIdsForBenchMode(toolIds: readonly string[]): string[] {
  if (BENCH_MODE_EXCLUDED_TOOL_IDS.length === 0) {
    return [...toolIds];
  }
  const excluded = new Set(BENCH_MODE_EXCLUDED_TOOL_IDS);
  return toolIds.filter((id) => !excluded.has(id));
}

export function buildBenchModeChatInstruction(): string {
  return [
    "QuickerBench mode (isolated task completion).",
    "Create a **new** Quicker action from scratch for the user request.",
    "Runtime input is `{quicker_in_param}`; set output variables `totalLikes` and `actionCount` when done.",
    "Do **not** manually verify output values — mock assert checks context variables after run.",
    "Workflow: `qkrpc_step_runner_search` → `get` → `qkrpc_action_create` → `workspace_program` (write_data / file_write / patch) → `workspace_program diagnostics`.",
    "HTTP pages come from **mock profile** — do NOT use web_search, browser, or task subagents.",
    "Paginate getquicker User/Actions with `sys:http` + `?p=N`; parse HTML with evalexpression `.eval.cs` (see quicker-authoring-getquicker-user-actions skill).",
    "Declare variables: userUrl, pageHtml, maxPage, page, loopCount, totalLikes, actionCount — runtime input is built-in `{quicker_in_param}`.",
    "After diagnostics pass, stop — mock assert verifies totalLikes/actionCount; do not read_data or re-edit.",
  ].join(" ");
}

function readToolName(partType: string): string {
  return partType.startsWith("tool-") ? partType.slice("tool-".length) : partType;
}

/** Prefer action id from qkrpc_action_create tool output in the thread. */
export function extractBenchActionIdFromMessages(
  messages: readonly UIMessage[],
): string | undefined {
  let lastCreateId: string | undefined;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!part.type.startsWith("tool-")) continue;
      const toolName = readToolName(part.type);
      if (!isQkrpcActionCreateTool(toolName, "input" in part ? part.input : undefined)) {
        continue;
      }
      const output = "output" in part ? part.output : undefined;
      if (!isStructuredToolResult(output)) continue;
      const id = parseActionIdFromSyncedToolOutput(output);
      if (id) lastCreateId = id;
    }
  }

  return lastCreateId;
}
