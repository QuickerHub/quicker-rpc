/** URL params when Quicker ActionDesigner embeds QuickerAgent chat via WebView2. */
export type ActionDesignerEmbedParams = {
  /** `embed=action-designer` (with or without entityId). */
  enabled: boolean;
  /** entityId set — production embed scoped to one designer window. */
  scoped: boolean;
  /** `embed=action-designer` without entityId — debug: sidebar lists all designer threads. */
  debugMode: boolean;
  entityId: string;
  isSubProgram: boolean;
};

export function parseActionDesignerEmbedFromSearchParams(
  params: URLSearchParams | { get(name: string): string | null },
): ActionDesignerEmbedParams {
  const embed = params.get("embed")?.trim() ?? "";
  const entityId = params.get("entityId")?.trim() ?? "";
  const isSubProgram = params.get("isSubProgram") === "1";
  const isDesignerEmbed = embed === "action-designer";
  return {
    enabled: isDesignerEmbed,
    scoped: isDesignerEmbed && entityId.length > 0,
    debugMode: isDesignerEmbed && entityId.length === 0,
    entityId,
    isSubProgram,
  };
}

/** Client-only: ActionDesigner WebView2 embed (skip SQLite chat-store API). */
export function isActionDesignerEmbedClient(): boolean {
  if (typeof window === "undefined") return false;
  return parseActionDesignerEmbedFromSearchParams(
    new URLSearchParams(window.location.search),
  ).enabled;
}
