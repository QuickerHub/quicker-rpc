import type {
  AgentEvalCapabilityAggregate,
  AgentEvalCapabilityAxis,
  AgentEvalCapabilityItem,
  AgentEvalCapabilitySummary,
  AgentEvalCapabilityStatus,
  AgentEvalReport,
  AgentEvalRuntimeMetadata,
  AgentEvalToolCall,
  AgentEvalTraceRubric,
} from "@/lib/agent-eval/types";

export type BuildAgentEvalCapabilitySummaryInput = {
  runtimeMetadata?: readonly AgentEvalRuntimeMetadata[];
  toolCalls: readonly AgentEvalToolCall[];
  traceRubric?: AgentEvalTraceRubric;
};

const AXES: AgentEvalCapabilityAxis[] = [
  "tool_protocol",
  "runtime_intent",
  "runtime_risk",
  "recovery",
  "verification",
];

function violationAxis(violation: string): AgentEvalCapabilityAxis {
  const text = violation.toLowerCase();
  if (text.includes("runtime intent") || text.includes("recommended tools")) {
    return "runtime_intent";
  }
  if (text.includes("runtime risk")) {
    return "runtime_risk";
  }
  if (text.includes("runtime recovery")) {
    return "recovery";
  }
  if (text.includes("diagnostics")) {
    return "verification";
  }
  return "tool_protocol";
}

function hasToolCall(
  toolCalls: readonly AgentEvalToolCall[],
  toolName: string,
  action?: string,
): boolean {
  return toolCalls.some((call) => {
    if (call.toolName !== toolName) return false;
    if (!action) return true;
    return call.input?.action === action;
  });
}

function createEmptyItems(): Map<AgentEvalCapabilityAxis, AgentEvalCapabilityItem> {
  return new Map(
    AXES.map((axis) => [
      axis,
      {
        axis,
        status: "pass" as const,
        notes: [],
      },
    ]),
  );
}

export function buildAgentEvalCapabilitySummary(
  input: BuildAgentEvalCapabilitySummaryInput,
): AgentEvalCapabilitySummary {
  const items = createEmptyItems();

  for (const violation of input.traceRubric?.violations ?? []) {
    const axis = violationAxis(violation);
    const item = items.get(axis)!;
    item.status = "fail";
    item.notes.push(violation);
  }

  if (!input.runtimeMetadata?.length) {
    for (const axis of ["runtime_intent", "runtime_risk", "recovery"] as const) {
      const item = items.get(axis)!;
      if (item.status === "pass") {
        item.status = "unknown";
        item.notes.push("runtime metadata not captured");
      }
    }
  }

  const verification = items.get("verification")!;
  if (
    verification.status === "pass"
    && !hasToolCall(input.toolCalls, "workspace_program", "diagnostics")
  ) {
    verification.status = "unknown";
    verification.notes.push("no workspace_program diagnostics call observed");
  }

  const output = AXES.map((axis) => items.get(axis)!);
  return {
    passed: output.every((item) => item.status !== "fail"),
    items: output,
  };
}

export function formatAgentEvalCapabilitySummary(
  summary: AgentEvalCapabilitySummary | undefined,
): string {
  if (!summary) return "capabilities: unavailable";
  const parts = summary.items.map(
    (item) => `${item.axis}=${item.status}`,
  );
  return `capabilities: ${parts.join(" ")}`;
}

export function aggregateAgentEvalCapabilitySummaries(
  reports: readonly Pick<AgentEvalReport, "capabilitySummary">[],
): AgentEvalCapabilityAggregate {
  const stats = new Map(
    AXES.map((axis) => [
      axis,
      {
        axis,
        pass: 0,
        fail: 0,
        unknown: 0,
      },
    ]),
  );

  for (const report of reports) {
    const byAxis = new Map(
      report.capabilitySummary?.items.map((item) => [item.axis, item.status])
      ?? [],
    );
    for (const axis of AXES) {
      const status: AgentEvalCapabilityStatus = byAxis.get(axis) ?? "unknown";
      stats.get(axis)![status] += 1;
    }
  }

  return {
    total: reports.length,
    axes: AXES.map((axis) => stats.get(axis)!),
  };
}

export function formatAgentEvalCapabilityAggregate(
  aggregate: AgentEvalCapabilityAggregate,
): string {
  const parts = aggregate.axes.map(
    (axis) => `${axis.axis}=P${axis.pass}/F${axis.fail}/U${axis.unknown}`,
  );
  return `capability aggregate (${aggregate.total}): ${parts.join(" ")}`;
}
