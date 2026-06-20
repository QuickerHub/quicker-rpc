import type {
  AgentEvalRuntimeMetadata,
  AgentEvalToolCall,
  AgentEvalTraceRubric,
} from "@/lib/agent-eval/types";

export type TraceRubricOptions = {
  chatMode?: "agent" | "launcher";
  readOnly?: boolean;
  runtimeMetadata?: readonly AgentEvalRuntimeMetadata[];
  source?: "authoring" | "agent-gui";
  taskId?: string;
};

function inputAction(call: AgentEvalToolCall): string | undefined {
  const action = call.input?.action;
  return typeof action === "string" ? action : undefined;
}

function inputJson(call: AgentEvalToolCall): string {
  try {
    return JSON.stringify(call.input ?? {});
  } catch {
    return "";
  }
}

function findLastPatchIndex(trace: readonly AgentEvalToolCall[]): number {
  for (let i = trace.length - 1; i >= 0; i -= 1) {
    const call = trace[i]!;
    if (call.toolName !== "workspace_program") continue;
    const action = inputAction(call);
    if (action === "patch" || action === "file_write" || action === "edit_data") {
      return i;
    }
  }
  return -1;
}

function lastTurnState(
  runtimeMetadata?: readonly AgentEvalRuntimeMetadata[],
): Record<string, unknown> | undefined {
  if (!runtimeMetadata?.length) return undefined;
  for (let i = runtimeMetadata.length - 1; i >= 0; i -= 1) {
    const turnState = runtimeMetadata[i]?.turnState;
    if (turnState) return turnState;
  }
  return undefined;
}

function lastRecoveryDecision(
  runtimeMetadata?: readonly AgentEvalRuntimeMetadata[],
): Record<string, unknown> | undefined {
  if (!runtimeMetadata?.length) return undefined;
  for (let i = runtimeMetadata.length - 1; i >= 0; i -= 1) {
    return runtimeMetadata[i]?.recoveryDecision;
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function findPostPatchVerification(
  trace: readonly AgentEvalToolCall[],
): boolean {
  return trace.some((call) => {
    if (call.toolName === "workspace_program" && inputAction(call) === "diagnostics") {
      return true;
    }
    if (
      call.toolName === "qkrpc_action_debug"
      || call.toolName === "qkrpc_action_run"
    ) {
      return true;
    }
    return false;
  });
}

function recoveryActionInputAction(
  recoveryDecision?: Record<string, unknown>,
): string | undefined {
  const action = recoveryDecision?.action;
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return undefined;
  }
  const input = (action as Record<string, unknown>).input;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const inputActionValue = (input as Record<string, unknown>).action;
  return typeof inputActionValue === "string" ? inputActionValue : undefined;
}

function recoveryKind(
  recoveryDecision?: Record<string, unknown>,
): string | undefined {
  const kind = recoveryDecision?.kind;
  return typeof kind === "string" ? kind : undefined;
}

function isMutationCall(call: AgentEvalToolCall): boolean {
  if (call.toolName === "workspace_program") {
    const action = inputAction(call);
    return action === "patch" || action === "file_write" || action === "edit_data";
  }
  return (
    call.toolName === "qkrpc_action_move"
    || call.toolName === "qkrpc_action_delete"
    || call.toolName === "qkrpc_action_write"
  );
}

/** Deterministic E-axis checks from tool trace (see docs/agent-authoring-benchmark.md). */
export function evaluateTraceRubric(
  trace: readonly AgentEvalToolCall[],
  options: TraceRubricOptions = {},
): AgentEvalTraceRubric {
  const violations: string[] = [];
  const taskId = options.taskId?.trim();
  const turnState = lastTurnState(options.runtimeMetadata);
  const recoveryDecision = lastRecoveryDecision(options.runtimeMetadata);

  const patchIdx = findLastPatchIndex(trace);
  if (patchIdx >= 0) {
    const afterPatch = trace.slice(patchIdx + 1);
    for (const call of afterPatch) {
      if (
        call.toolName === "qkrpc_action_get"
        || (call.toolName === "workspace_program" && inputAction(call) === "read_data")
      ) {
        violations.push(
          "E: patch followed by full sync/read (qkrpc_action_get or workspace_program read_data)",
        );
        break;
      }
    }

    const patchCall = trace[patchIdx]!;
    const patchJson = inputJson(patchCall);
    if (/"steps"\s*:\s*\[/.test(patchJson) && inputAction(patchCall) === "patch") {
      violations.push("E: inline steps JSON in workspace_program patch input");
    }
  }

  let sawStepRunnerGet = false;
  let sawInputParamsPatch = false;
  for (const call of trace) {
    if (call.toolName === "qkrpc_step_runner_get") {
      sawStepRunnerGet = true;
    }
    if (
      call.toolName === "workspace_program"
      && inputAction(call) === "patch"
      && /inputParams/.test(inputJson(call))
    ) {
      sawInputParamsPatch = true;
      if (!sawStepRunnerGet) {
        violations.push("E: patch with inputParams before qkrpc_step_runner_get");
      }
    }
  }

  if (taskId === "clip-lines-expr") {
    for (const call of trace) {
      if (
        call.toolName === "workspace_program"
        && /sys:csscript|csscript/i.test(inputJson(call))
      ) {
        violations.push("E: clip-lines-expr used sys:csscript in workspace_program");
        break;
      }
    }
  }

  if (taskId === "regression-no-get-after-patch" && patchIdx < 0) {
    violations.push("E: expected a title-only patch for regression-no-get-after-patch");
  }

  if (taskId === "regression-no-inline-patch-json") {
    const inlinePatch = trace.some(
      (call) =>
        call.toolName === "workspace_program"
        && inputAction(call) === "patch"
        && /"steps"\s*:\s*\[/.test(inputJson(call)),
    );
    if (inlinePatch) {
      violations.push("E: regression-no-inline-patch-json must patch via disk, not inline steps");
    }
  }

  if (options.runtimeMetadata?.length) {
    if (!turnState) {
      violations.push("E: runtime metadata missing turnState");
    } else {
      const intent = typeof turnState.intent === "string" ? turnState.intent : "";
      const risk = typeof turnState.risk === "string" ? turnState.risk : "";
      const recommendedToolIds = stringArray(turnState.recommendedToolIds);

      if (options.source === "authoring" && !options.readOnly && intent !== "action_authoring") {
        violations.push(
          `E: runtime intent expected action_authoring, got ${intent || "(missing)"}`,
        );
      }

      if (
        options.source === "authoring"
        && options.chatMode !== "launcher"
        && !options.readOnly
        && !recommendedToolIds.includes("workspace_program")
      ) {
        violations.push("E: runtime recommended tools missing workspace_program");
      }

      if (options.readOnly && risk !== "read") {
        violations.push(`E: runtime risk expected read, got ${risk || "(missing)"}`);
      } else if (options.source === "authoring" && !options.readOnly && risk !== "write") {
        violations.push(`E: runtime risk expected write, got ${risk || "(missing)"}`);
      }
    }

    const kind = recoveryKind(recoveryDecision);
    if (kind === "ask_user") {
      const mutationAfterDecision = trace.some(isMutationCall);
      if (mutationAfterDecision) {
        violations.push("E: runtime recovery asked user but trace contains mutation tool calls");
      }
    }

    if (patchIdx >= 0) {
      const afterPatch = trace.slice(patchIdx + 1);
      const sawVerification = findPostPatchVerification(afterPatch);
      if (!sawVerification) {
        const recoveryAction = recoveryActionInputAction(recoveryDecision);
        if (
          kind !== "next_action"
          || (recoveryAction !== "diagnostics" && recoveryAction !== "debug")
        ) {
          violations.push(
            "E: runtime recovery should recommend diagnostics or debug after workspace_program patch",
          );
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
