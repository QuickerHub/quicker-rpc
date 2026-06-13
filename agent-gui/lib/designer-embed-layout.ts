import type { ActionDesignerEmbedParams } from "@/lib/action-designer-embed";
import type {
  DesignerContextSnapshot,
  DesignerWindowContext,
} from "@/lib/designer-context-types";

/** Match designer.context entry to the embed URL params. */
export function resolveDesignerWindowContext(
  snapshot: DesignerContextSnapshot | null,
  embed: Pick<ActionDesignerEmbedParams, "scoped" | "entityId" | "isSubProgram">,
): DesignerWindowContext | null {
  if (!embed.scoped) return null;

  const entityId = embed.entityId.trim();
  if (!entityId) return null;

  const needle = entityId.toLowerCase();
  const designers = snapshot?.designers ?? [];

  const exact = designers.find(
    (item) =>
      item.entityId?.trim().toLowerCase() === needle
      && (item.isSubProgram ?? false) === embed.isSubProgram,
  );
  if (exact) return exact;

  const sameEntity = designers.find(
    (item) => item.entityId?.trim().toLowerCase() === needle,
  );
  if (sameEntity) return sameEntity;

  const active = designers.find((item) => item.isActive);
  if (active) return active;

  return {
    entityId,
    isSubProgram: embed.isSubProgram,
  };
}

export function designerContextTitle(
  ctx: DesignerWindowContext | null,
  embed: Pick<ActionDesignerEmbedParams, "isSubProgram">,
): string {
  const title = ctx?.title?.trim();
  if (title) return title;
  return embed.isSubProgram ? "子程序" : "当前动作";
}
