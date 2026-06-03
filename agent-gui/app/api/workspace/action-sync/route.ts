import { runWithQkrpcCwdAsync } from "@/lib/qkrpc-request-context";
import {
  getActionProjectSyncStatus,
  pullActionProjectToWorkspace,
  pushActionProjectToQuicker,
} from "@/lib/action-project-sync";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: {
    cwd?: string;
    op?: string;
    actionId?: string;
    projectDirectory?: string;
    force?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const cwd = body.cwd?.trim() || undefined;
  const op = body.op?.trim() || "";
  const actionId = body.actionId?.trim() || "";

  if (!actionId) {
    return Response.json({ ok: false, error: "actionId is required" }, { status: 400 });
  }

  try {
    return await runWithQkrpcCwdAsync(cwd, async () => {
      if (op === "status") {
        const result = await getActionProjectSyncStatus(actionId);
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error }, { status: 400 });
        }
        return Response.json({ ok: true, status: result.status });
      }

      if (op === "pull") {
        const result = await pullActionProjectToWorkspace(actionId, {
          projectDirectory: body.projectDirectory?.trim() || undefined,
        });
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error }, { status: 400 });
        }
        return Response.json({
          ok: true,
          message: result.message,
          summary: result.summary,
        });
      }

      if (op === "push") {
        const result = await pushActionProjectToQuicker({
          actionId,
          force: body.force === true,
        });
        if (!result.ok) {
          return Response.json(
            { ok: false, error: result.error, phase: result.phase },
            { status: 400 },
          );
        }
        return Response.json({
          ok: true,
          message: result.message,
          editVersion: result.editVersion,
        });
      }

      return Response.json({ ok: false, error: `unknown op: ${op}` }, { status: 400 });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/workspace/action-sync]", error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
