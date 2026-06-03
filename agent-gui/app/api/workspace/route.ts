import { runWithQkrpcCwdAsync } from "@/lib/qkrpc-request-context";
import {
  buildActionExplorerTree,
  deleteActionProjectFromWorkspace,
  readWorkspaceFileForApi,
  writeWorkspaceFileForApi,
} from "@/lib/action-explorer-server";

export const dynamic = "force-dynamic";

function workspaceApiError(error: unknown, label: string): Response {
  console.error(`[api/workspace] ${label}`, error);
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, error: message }, { status: 500 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd")?.trim() || undefined;
  const op = url.searchParams.get("op")?.trim() || "tree";
  const path = url.searchParams.get("path")?.trim() || "";

  try {
    return await runWithQkrpcCwdAsync(cwd, async () => {
      if (op === "tree") {
        const result = await buildActionExplorerTree();
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error }, { status: 400 });
        }
        return Response.json({ ok: true, tree: result.tree });
      }

      if (op === "read") {
        if (!path) {
          return Response.json({ ok: false, error: "path is required" }, { status: 400 });
        }
        const offset = Number(url.searchParams.get("offset") ?? "0");
        const limitRaw = url.searchParams.get("limit");
        const limit = limitRaw ? Number(limitRaw) : undefined;
        const result = await readWorkspaceFileForApi(path, {
          offset: Number.isFinite(offset) ? offset : 0,
          limit: limit && Number.isFinite(limit) ? limit : undefined,
        });
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error }, { status: 400 });
        }
        return Response.json(result);
      }

      return Response.json({ ok: false, error: `unknown op: ${op}` }, { status: 400 });
    });
  } catch (error) {
    return workspaceApiError(error, "GET");
  }
}

export async function POST(req: Request) {
  let body: {
    cwd?: string;
    op?: string;
    path?: string;
    content?: string;
    projectPath?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const cwd = body.cwd?.trim() || undefined;
  const op = body.op?.trim() || "";
  const path = body.path?.trim() || "";
  const content = body.content;

  try {
    return await runWithQkrpcCwdAsync(cwd, async () => {
      if (op === "write") {
        if (!path) {
          return Response.json({ ok: false, error: "path is required" }, { status: 400 });
        }
        if (typeof content !== "string") {
          return Response.json({ ok: false, error: "content is required" }, { status: 400 });
        }
        const result = await writeWorkspaceFileForApi(path, content);
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error }, { status: 400 });
        }
        return Response.json({ ok: true, path: result.path });
      }

      if (op === "delete-project") {
        const projectPath = (body.projectPath ?? path)?.trim();
        if (!projectPath) {
          return Response.json(
            { ok: false, error: "projectPath is required" },
            { status: 400 },
          );
        }
        const result = await deleteActionProjectFromWorkspace(projectPath);
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error }, { status: 400 });
        }
        return Response.json({ ok: true });
      }

      return Response.json({ ok: false, error: `unknown op: ${op}` }, { status: 400 });
    });
  } catch (error) {
    return workspaceApiError(error, "POST");
  }
}
