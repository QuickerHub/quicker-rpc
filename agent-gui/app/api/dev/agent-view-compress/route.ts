import { NextResponse } from "next/server";
import {
  estimateStructuredResultChars,
  formatToolResultForAgent,
} from "@/lib/tool-result-agent-view";
import { readAgentViewCompressStats } from "@/lib/tool-result-agent-view-display";
import { isStructuredToolResult } from "@/lib/tool-result";
import {
  AGENT_VIEW_SCENARIOS,
  getAgentViewScenario,
} from "@/lib/tool-test-agent-view-scenarios";

export const runtime = "nodejs";

type AgentViewCompressRequest = {
  scenarioId?: string;
};

function estimatePayloadChars(value: unknown): number {
  if (!isStructuredToolResult(value)) {
    return JSON.stringify(value).length;
  }
  return estimateStructuredResultChars(value);
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  return NextResponse.json({
    scenarios: AGENT_VIEW_SCENARIOS.map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      description: scenario.description,
      toolName: scenario.toolName,
    })),
  });
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  let body: AgentViewCompressRequest;
  try {
    body = (await req.json()) as AgentViewCompressRequest;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const scenario = getAgentViewScenario(body.scenarioId?.trim() ?? "");
  if (!scenario) {
    return NextResponse.json({ error: "UNKNOWN_SCENARIO" }, { status: 400 });
  }

  const raw = scenario.buildRaw();
  const beforeChars = estimatePayloadChars(raw);
  const compressed = formatToolResultForAgent(
    scenario.toolName,
    scenario.input,
    raw,
  );
  const afterChars = estimatePayloadChars(compressed);
  const stats = readAgentViewCompressStats(compressed);

  return NextResponse.json({
    scenarioId: scenario.id,
    toolName: scenario.toolName,
    beforeChars,
    afterChars,
    savedChars: Math.max(0, beforeChars - afterChars),
    compressed: isStructuredToolResult(compressed) && compressed.displayData != null,
    agentView: stats,
    output: compressed,
  });
}
