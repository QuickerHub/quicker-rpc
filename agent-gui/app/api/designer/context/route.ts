import type { DesignerContextSnapshot } from "@/lib/designer-context-types";
import { parseDesignerContext } from "@/lib/designer-context-parse";
import { fetchDesignerContextSnapshot } from "@/lib/designer-context.server";

export const dynamic = "force-dynamic";

/** Open ActionDesigner windows (entity id + selected steps) for embedded chat @-mentions. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const includeXAction = url.searchParams.get("includeXAction") === "1";
  const snapshot = await fetchDesignerContextSnapshot(includeXAction);
  if (!snapshot.ok) {
    return Response.json(snapshot, { status: 503 });
  }
  return Response.json(snapshot);
}

export { parseDesignerContext };
export type { DesignerContextSnapshot };
