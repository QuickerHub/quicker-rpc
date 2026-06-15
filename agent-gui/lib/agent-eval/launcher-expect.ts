import type { AgentEvalToolCall, AgentEvalTraceRubric } from "@/lib/agent-eval/types";

/** Launcher eval focuses on user outcome, not a single implementation path. */
export type LauncherSettingsOpenExpect = {
  page?: string;
  preset?: string;
  intent?: string;
};

export type LauncherEvalExpect = {
  intent: "open-settings" | "open-search" | "run-action";
  settingsOpen?: LauncherSettingsOpenExpect;
  /**
   * For run-action: at least one planning/execution tool must appear.
   * Defaults: launcher_resolve | qkrpc_action_query | qkrpc_action_run | ask_question
   */
  engageAny?: string[];
};

export const LAUNCHER_EVAL_FORBIDDEN_TOOLS = [
  "workspace_program",
  "Write",
  "StrReplace",
  "qkrpc_step_runner_get",
  "qkrpc_step_runner_search",
] as const;

const DEFAULT_RUN_ACTION_ENGAGE = [
  "launcher_resolve",
  "qkrpc_action_query",
  "qkrpc_action_run",
  "ask_question",
] as const;

function asInputRecord(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return input ?? {};
}

function matchesSettingsOpenCriteria(
  input: Record<string, unknown>,
  criteria: LauncherSettingsOpenExpect,
): boolean {
  const action = input.action;
  if (action !== undefined && action !== "open") {
    return false;
  }

  if (criteria.page && input.page === criteria.page) {
    return true;
  }
  if (criteria.preset && input.preset === criteria.preset) {
    return true;
  }
  if (criteria.intent && input.intent === criteria.intent) {
    return true;
  }

  // Common aliases between page id and preset slug.
  if (criteria.page === "recycle-bin" && input.preset === "recycle-bin") {
    return true;
  }
  if (criteria.page === "FunctionHotkeys" && input.preset === "hotkeys") {
    return true;
  }
  if (criteria.intent === "open-search") {
    if (input.intent === "open-search") return true;
    if (input.page === "search" || input.target === "search") return true;
  }

  return false;
}

function findQuickerSettingsOpen(
  trace: readonly AgentEvalToolCall[],
  criteria: LauncherSettingsOpenExpect,
): AgentEvalToolCall | undefined {
  return trace.find((call) => {
    if (call.toolName !== "quicker_settings") return false;
    return matchesSettingsOpenCriteria(asInputRecord(call.input), criteria);
  });
}

function traceIncludesAny(
  trace: readonly AgentEvalToolCall[],
  toolNames: readonly string[],
): boolean {
  const set = new Set(toolNames);
  return trace.some((call) => set.has(call.toolName));
}

function classifyLauncherPath(
  trace: readonly AgentEvalToolCall[],
): "cache-or-resolve-direct" | "llm" | "empty" {
  if (trace.length === 0) return "empty";
  if (trace.some((call) => call.toolName === "launcher_resolve")) {
    return "llm";
  }
  return "cache-or-resolve-direct";
}

export function evaluateLauncherExpect(
  trace: readonly AgentEvalToolCall[],
  launcher: LauncherEvalExpect,
): AgentEvalTraceRubric {
  const violations: string[] = [];
  const path = classifyLauncherPath(trace);

  if (launcher.intent === "open-settings" || launcher.intent === "open-search") {
    const criteria =
      launcher.settingsOpen
      ?? (launcher.intent === "open-search"
        ? { intent: "open-search" as const }
        : undefined);

    if (!criteria) {
      violations.push("launcher: open-settings requires settingsOpen criteria");
    } else {
      const match = findQuickerSettingsOpen(trace, criteria);
      if (!match) {
        violations.push(
          `launcher: expected quicker_settings open matching ${JSON.stringify(criteria)} (path=${path})`,
        );
      }
    }

    const maxSteps = path === "llm" ? 4 : 2;
    if (trace.length > maxSteps) {
      violations.push(
        `launcher: ${trace.length} tool calls exceeds ${maxSteps} for settings intent (path=${path})`,
      );
    }
  }

  if (launcher.intent === "run-action") {
    const engage = launcher.engageAny ?? [...DEFAULT_RUN_ACTION_ENGAGE];
    if (!traceIncludesAny(trace, engage)) {
      violations.push(
        `launcher: expected one of [${engage.join(", ")}] for run-action intent`,
      );
    }
    if (trace.length > 6) {
      violations.push(`launcher: ${trace.length} tool calls exceeds 6 for run-action`);
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
