import type { Tool, ToolSet } from "ai";

import { formatLocalToolResult } from "@/lib/tool-result";

export type ToolCallPolicy = {
  /** Maximum executions of this tool in one agent turn. */
  maxCallsPerTurn: number;
  /** Maximum executions with byte-for-byte equivalent JSON input. */
  maxIdenticalCallsPerTurn: number;
};

const DEFAULT_TOOL_CALL_POLICY: ToolCallPolicy = {
  maxCallsPerTurn: 12,
  maxIdenticalCallsPerTurn: 3,
};

const BUILTIN_TOOL_CALL_POLICIES: Record<string, ToolCallPolicy> = {
  qkrpc_wait: { maxCallsPerTurn: 1, maxIdenticalCallsPerTurn: 1 },
  qkrpc_action_delete: { maxCallsPerTurn: 1, maxIdenticalCallsPerTurn: 1 },
  qkrpc_subprogram_delete: { maxCallsPerTurn: 1, maxIdenticalCallsPerTurn: 1 },
  task: { maxCallsPerTurn: 3, maxIdenticalCallsPerTurn: 1 },
  skill_load: { maxCallsPerTurn: 8, maxIdenticalCallsPerTurn: 2 },
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? String(value) : encoded;
}

export function resolveToolCallPolicy(
  toolId: string,
  override?: Partial<ToolCallPolicy>,
): ToolCallPolicy {
  const base = toolId.startsWith("mcp__")
    ? { maxCallsPerTurn: 8, maxIdenticalCallsPerTurn: 2 }
    : (BUILTIN_TOOL_CALL_POLICIES[toolId] ?? DEFAULT_TOOL_CALL_POLICY);
  return {
    maxCallsPerTurn: override?.maxCallsPerTurn ?? base.maxCallsPerTurn,
    maxIdenticalCallsPerTurn:
      override?.maxIdenticalCallsPerTurn ?? base.maxIdenticalCallsPerTurn,
  };
}

function limitResult(params: {
  toolId: string;
  kind: "total" | "identical";
  limit: number;
}) {
  const message = params.kind === "identical"
    ? `Tool ${params.toolId} received the same input more than ${params.limit} time(s) in this turn. Reuse the previous result or change the approach.`
    : `Tool ${params.toolId} exceeded its ${params.limit}-call limit for this turn. Continue with existing results or ask the user before retrying.`;
  return formatLocalToolResult(
    {
      errorCode: "tool_call_limit",
      toolId: params.toolId,
      limitKind: params.kind,
      limit: params.limit,
    },
    false,
    message,
    { summary: message, retryable: false },
  );
}

/**
 * Apply deterministic, per-turn limits at the execution boundary.
 * The returned closure owns its counters, so a new wrapper must be created per turn.
 */
export function applyToolCallPolicies<T extends ToolSet>(
  tools: T,
  overrides: Record<string, Partial<ToolCallPolicy> | undefined> = {},
): T {
  const totalCalls = new Map<string, number>();
  const identicalCalls = new Map<string, number>();
  const wrapped = {} as T;

  for (const [toolId, definition] of Object.entries(tools)) {
    const toolDefinition = definition as Tool;
    if (!toolDefinition.execute) {
      (wrapped as ToolSet)[toolId] = definition;
      continue;
    }

    const execute = toolDefinition.execute;
    const policy = resolveToolCallPolicy(toolId, overrides[toolId]);
    (wrapped as ToolSet)[toolId] = {
      ...toolDefinition,
      execute: async (input, options) => {
        const total = (totalCalls.get(toolId) ?? 0) + 1;
        totalCalls.set(toolId, total);
        if (total > policy.maxCallsPerTurn) {
          return limitResult({
            toolId,
            kind: "total",
            limit: policy.maxCallsPerTurn,
          });
        }

        const fingerprint = `${toolId}:${stableJson(input)}`;
        const identical = (identicalCalls.get(fingerprint) ?? 0) + 1;
        identicalCalls.set(fingerprint, identical);
        if (identical > policy.maxIdenticalCallsPerTurn) {
          return limitResult({
            toolId,
            kind: "identical",
            limit: policy.maxIdenticalCallsPerTurn,
          });
        }

        return execute(input, options);
      },
    } as Tool;
  }

  return wrapped;
}

