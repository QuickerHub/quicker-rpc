import { NextResponse } from "next/server";
import { runHarnessScenarioPreviewById } from "@/lib/agent-harness/harness-preview";
import { HARNESS_SCENARIOS } from "@/lib/tool-test-harness-scenarios";
import { runWithAgentRequestContextAsync } from "@/lib/qkrpc-request-context";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";

export const runtime = "nodejs";

type HarnessPreviewRequest = {
  scenarioId?: string;
  workingDirectory?: string;
};

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  return NextResponse.json({
    scenarios: HARNESS_SCENARIOS.map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      description: scenario.description,
      kind: scenario.kind,
    })),
  });
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  let body: HarnessPreviewRequest;
  try {
    body = (await req.json()) as HarnessPreviewRequest;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const scenarioId = body.scenarioId?.trim() ?? "";
  const cwd = resolveEffectiveWorkingDirectory(body.workingDirectory);

  const result = await runWithAgentRequestContextAsync({ cwd }, async () =>
    runHarnessScenarioPreviewById(scenarioId, {
      toolCallId: `harness-${scenarioId || "unknown"}`,
    }),
  );

  if (!result) {
    return NextResponse.json({ error: "UNKNOWN_SCENARIO" }, { status: 400 });
  }

  return NextResponse.json({
    scenarioId,
    result,
  });
}
