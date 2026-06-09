import { invokeQkrpcHttp } from "@/lib/qkrpc-http";

export const dynamic = "force-dynamic";

type SummaryStepInput = {
  stepId?: string;
  stepRunnerKey?: string;
  stepJson?: string;
};

type SummariesRequest = {
  steps?: SummaryStepInput[];
  subProgramsJson?: string | null;
};

function unwrapPayload(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "object" || data === null) return null;
  const root = data as Record<string, unknown>;
  if (typeof root.payload === "object" && root.payload !== null) {
    return root.payload as Record<string, unknown>;
  }
  return root;
}

export async function POST(req: Request) {
  let body: SummariesRequest;
  try {
    body = (await req.json()) as SummariesRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const steps = (body.steps ?? [])
    .map((step) => ({
      stepId: (step.stepId ?? "").trim(),
      stepRunnerKey: (step.stepRunnerKey ?? "").trim(),
      stepJson: step.stepJson ?? "",
    }))
    .filter((step) => step.stepId.length > 0);

  if (steps.length === 0) {
    return Response.json({ ok: true, items: [] });
  }

  const subProgramsJson =
    typeof body.subProgramsJson === "string" && body.subProgramsJson.trim()
      ? body.subProgramsJson.trim()
      : undefined;

  const result = await invokeQkrpcHttp(
    {
      op: "step-runner.summaries",
      args: { steps, subProgramsJson },
    },
    { timeoutMs: 60_000 },
  );

  if (!result?.ok) {
    return Response.json(
      { ok: false, error: result?.stderr || "step-runner summaries failed" },
      { status: 503 },
    );
  }

  const payload = unwrapPayload(result.parsed);
  const itemsRaw = Array.isArray(payload?.items) ? payload!.items : [];
  const items = itemsRaw
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((item) => ({
      stepId: typeof item.stepId === "string" ? item.stepId : "",
      summary: typeof item.summary === "string" ? item.summary : "",
    }))
    .filter((item) => item.stepId.length > 0);

  return Response.json({ ok: true, items });
}
