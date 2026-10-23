import { runWithAgentRequestContextAsync } from "@/lib/qkrpc-request-context";
import {
  getActionProjectSyncStatus,
  pullActionProjectToWorkspace,
  pushActionProjectToQuicker,
} from "@/lib/action-project-sync";
import { ActionProjectBindingError, parseActionProjectBinding } from "@/lib/action-project-binding";
import type { ActionProjectSyncTarget } from "@/lib/action-project-sync-target";

export const dynamic = "force-dynamic";

function cancelled(req: Request): Response {
  const reason: unknown = req.signal.reason;
  return Response.json({ ok: false, error: "REQUEST_ABORTED", retryable: false,
    message: reason instanceof Error ? reason.message : String(reason ?? "Request cancelled") }, { status: 499 });
}

export async function POST(req: Request) {
  let body: {
    cwd?: string;
    op?: string;
    actionId?: string;
    projectDirectory?: string;
    force?: boolean;
    expectedProjectBinding?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    if (req.signal.aborted) return cancelled(req);
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const cwd = body.cwd?.trim() || undefined;
  const op = body.op?.trim() || "";
  const actionId = body.actionId?.trim() || "";

  if (!actionId) {
    return Response.json({ ok: false, error: "actionId is required" }, { status: 400 });
  }

  try {
    req.signal.throwIfAborted();
    return await runWithAgentRequestContextAsync({ cwd, abortSignal: req.signal }, async () => {
      let target: ActionProjectSyncTarget | undefined;
      if (Object.hasOwn(body, "expectedProjectBinding")) {
        if (body.expectedProjectBinding === null) return Response.json({ ok: false, code: "HOST_BINDING_REQUIRED", error: "Unbound projects cannot sync to a host.", retryable: false }, { status: 409 });
        if (typeof body.projectDirectory !== "string" || !body.projectDirectory.trim()) return Response.json({ ok: false, code: "PROJECT_IDENTITY_CONFLICT", error: "The document project directory is required.", retryable: false }, { status: 409 });
        target = { projectDirectory: body.projectDirectory.trim().replace(/\\/g, "/"), projectBinding: parseActionProjectBinding(body.expectedProjectBinding, actionId) };
      }
      if (op === "status") {
        const result = await getActionProjectSyncStatus(actionId, target);
        if (!result.ok) {
          return Response.json(result, { status: 400 });
        }
        return Response.json(result);
      }

      if (op === "pull") {
        const result = await pullActionProjectToWorkspace(actionId, {
          projectDirectory: body.projectDirectory?.trim() || undefined,
          target,
        });
        if (!result.ok) {
          return Response.json(result, { status: 400 });
        }
        return Response.json({
          ok: true,
          message: result.message,
          summary: result.summary,
          projectDirectory: result.projectDirectory,
          projectBinding: result.projectBinding,
        });
      }

      if (op === "push") {
        const result = await pushActionProjectToQuicker({
          actionId,
          force: body.force === true,
          target,
        });
        if (!result.ok) {
          return Response.json(
            {
              ok: false,
              error: result.error,
              phase: result.phase,
              versionConflict: result.versionConflict === true,
              code: result.code,
              retryable: result.retryable,
              persistedParts: result.persistedParts,
            },
            { status: 400 },
          );
        }
        return Response.json({
          ok: true,
          message: result.message,
          editVersion: result.editVersion,
          projectDirectory: result.projectDirectory,
          projectBinding: result.projectBinding,
        });
      }

      return Response.json({ ok: false, error: `unknown op: ${op}` }, { status: 400 });
    });
  } catch (error) {
    if (req.signal.aborted) return cancelled(req);
    if (error instanceof ActionProjectBindingError) return Response.json({ ok: false, code: error.code, error: error.message, retryable: false }, { status: 409 });
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/workspace/action-sync]", error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
