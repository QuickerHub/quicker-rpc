import { invokeQkrpcHttp } from "@/lib/qkrpc-http";

export const dynamic = "force-dynamic";

type ToolboxSearchRequest = {
  keyword?: string;
  skip?: number;
};

function unwrapPayloadJson(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const root = data as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;
  const json = payload.json;
  return typeof json === "string" ? json : null;
}

export async function POST(req: Request) {
  let body: ToolboxSearchRequest;
  try {
    body = (await req.json()) as ToolboxSearchRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await invokeQkrpcHttp(
    {
      op: "step-runner.toolboxsearch",
      args: {
        keyword: (body.keyword ?? "").trim(),
        skip: Math.max(0, Number(body.skip ?? 0)),
      },
    },
    { timeoutMs: 60_000 },
  );

  if (!result?.ok) {
    return Response.json(
      { ok: false, error: result?.stderr || "step-runner toolbox search failed" },
      { status: 503 },
    );
  }

  const json = unwrapPayloadJson(result.parsed);
  if (!json) {
    return Response.json(
      { ok: false, error: "step-runner toolbox search: missing payload.json" },
      { status: 503 },
    );
  }

  return Response.json({ ok: true, json });
}
