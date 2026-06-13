"use client";

import { useMemo } from "react";
import type { ActionDesignerEmbedParams } from "@/lib/action-designer-embed";
import {
  buildDesignerMentionItems,
  mergeDesignerMentionItems,
} from "@/lib/designer-mention-items";
import type { DesignerContextSnapshot } from "@/lib/designer-context-types";
import {
  useActionMentionSearch,
  type MentionSearchView,
  type UseActionMentionSearchOptions,
} from "@/lib/use-action-mention-search";

export function useDesignerAwareMentionSearch(
  query: string | null,
  embed: ActionDesignerEmbedParams,
  designerContext: DesignerContextSnapshot | null,
  options?: UseActionMentionSearchOptions,
): MentionSearchView {
  const base = useActionMentionSearch(query, options);
  const limit = options?.limit ?? 8;

  const items = useMemo(() => {
    if (query === null) return [];
    if (!embed.enabled) return base.items;

    const designerItems = buildDesignerMentionItems(
      designerContext,
      embed.entityId,
      embed.isSubProgram,
      query,
      limit,
    );
    return mergeDesignerMentionItems(
      designerItems,
      base.items,
      embed.entityId,
      limit,
    );
  }, [
    base.items,
    designerContext,
    embed.enabled,
    embed.entityId,
    embed.isSubProgram,
    limit,
    query,
  ]);

  if (!embed.enabled || query === null) {
    return base;
  }

  return {
    items,
    isRefreshing: base.isRefreshing,
    error: base.error,
  };
}
