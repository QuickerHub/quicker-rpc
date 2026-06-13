import { invokeQkrpcHttp } from "@/lib/qkrpc-http";
import { runQkrpc } from "@/lib/qkrpc";

export const dynamic = "force-dynamic";

type TextToolRequestBody = {
  toolId?: string;
  currentValue?: string;
  timeoutSeconds?: number;
};

function parseBody(raw: unknown): TextToolRequestBody | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const body = raw as Record<string, unknown>;
  const toolId = typeof body.toolId === "string" ? body.toolId.trim() : "";
  if (!toolId) {
    return null;
  }
  return {
    toolId,
    currentValue: typeof body.currentValue === "string" ? body.currentValue : "",
    timeoutSeconds:
      typeof body.timeoutSeconds === "number" && Number.isFinite(body.timeoutSeconds)
        ? body.timeoutSeconds
        : undefined,
  };
}

function unwrapPayload(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const root = parsed as Record<string, unknown>;
  if (typeof root.payload === "object" && root.payload !== null) {
    return root.payload;
  }
  if (typeof root.data === "object" && root.data !== null) {
    const data = root.data as Record<string, unknown>;
    if (typeof data.payload === "object" && data.payload !== null) {
      return data.payload;
    }
    return data;
  }
  return root;
}

async function invokeTextTool(body: TextToolRequestBody) {
  const args: Record<string, unknown> = {
    toolId: body.toolId,
    currentValue: body.currentValue ?? "",
  };
  if (body.timeoutSeconds != null) {
    args.timeoutSeconds = body.timeoutSeconds;
  }

  const http = await invokeQkrpcHttp(
    {
      op: "designer.textTool",
      args,
    },
    { timeoutMs: (body.timeoutSeconds ?? 300) * 1000 + 15_000 },
  );
  if (http !== null) {
    return http;
  }

  return runQkrpc(
    [
      "serve",
      "invoke",
      "--op",
      "designer.textTool",
      "--args",
      JSON.stringify(args),
      "--json",
    ],
    { timeoutMs: (body.timeoutSeconds ?? 300) * 1000 + 15_000 },
  );
}

/** Run one Quicker TextToolType picker via qkrpc plugin (for web action designer). */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const body = parseBody(json);
  if (!body) {
    return Response.json({ ok: false, message: "toolId is required." }, { status: 400 });
  }

  const result = await invokeTextTool(body);
  if (!result.ok || result.parsed === null) {
    return Response.json(
      {
        ok: false,
        message: result.stderr.trim() || "designer.textTool unavailable",
      },
      { status: 503 },
    );
  }

  const payload = unwrapPayload(result.parsed);
  if (typeof payload !== "object" || payload === null) {
    return Response.json({ ok: false, message: "Invalid text-tool payload." }, { status: 502 });
  }

  const row = payload as Record<string, unknown>;
  if (row.ok !== true) {
    const message =
      (typeof row.message === "string" && row.message.trim()) ||
      (typeof row.errorMessage === "string" && row.errorMessage.trim()) ||
      "Text tool failed.";
    return Response.json({ ok: false, message }, { status: 502 });
  }

  return Response.json({
    ok: true,
    cancelled: row.cancelled === true,
    value: typeof row.value === "string" ? row.value : "",
    message: typeof row.message === "string" ? row.message : "",
  });
}
