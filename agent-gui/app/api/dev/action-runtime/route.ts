import { NextResponse } from "next/server";
import {
  invokeActionRuntime,
  type ActionRuntimeOp,
} from "@/lib/action-runtime-invoke.server";
import { getRequestCwd } from "@/lib/qkrpc-request-context";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";

export const runtime = "nodejs";

type RequestBody = {
  op?: ActionRuntimeOp;
  args?: Record<string, unknown>;
};

function buildArgs(op: ActionRuntimeOp, raw: Record<string, unknown> | undefined) {
  const args = { ...(raw ?? {}) };
  const cwd = resolveEffectiveWorkingDirectory(getRequestCwd());
  if (
    op === "validate"
    || op === "run"
    || op === "check"
    || op === "mockRun"
  ) {
    if (!args.workspaceRoot && typeof cwd === "string" && cwd.trim()) {
      args.workspaceRoot = cwd;
    }
  }
  if (op === "run" || op === "check") {
    args.standalone = true;
  }
  if (op === "mockRun") {
    args.mock = true;
    if (args.assert === undefined) {
      args.assert = true;
    }
  }
  return args;
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON", message: "Request body must be JSON" },
      { status: 400 },
    );
  }

  const op = body.op;
  if (
    op !== "run"
    && op !== "check"
    && op !== "keys"
    && op !== "validate"
    && op !== "mockRun"
    && op !== "mockProfilesList"
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "INVALID_OP",
        message:
          "op must be run | check | keys | validate | mockRun | mockProfilesList",
      },
      { status: 400 },
    );
  }

  const result = await invokeActionRuntime(op, buildArgs(op, body.args));

  if (!result.ok && result.parsed == null) {
    return NextResponse.json(
      {
        ok: false,
        error: "INVOKE_FAILED",
        message:
          (typeof result.stderr === "string" && result.stderr.trim())
          || "qkrpc serve 未启动且 CLI 回退失败",
      },
      { status: 503 },
    );
  }

  const data = result.parsed as { ok?: boolean } | null | undefined;
  const payloadOk = data && typeof data === "object" && data.ok !== false;

  return NextResponse.json(
    {
      ok: payloadOk,
      data: result.parsed ?? null,
    },
    { status: payloadOk ? 200 : 422 },
  );
}
