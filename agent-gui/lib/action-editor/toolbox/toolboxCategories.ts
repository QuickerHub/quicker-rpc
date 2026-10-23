type StepRunnerCategoryInfo = { key: string; label: string; icon: string; order: number };

export const TOOLBOX_ALL_TAB_KEY = "all";
export const TOOLBOX_FAVORITES_TAB_KEY = "favorites";

export type ToolboxTab = {
  /** StepRunnerCategory enum name, or one of the client-owned all/favorites tabs. */
  key: string;
  label: string;
  /** Quicker fa: icon spec for the tab glyph. */
  icon: string;
};

export type ToolboxCategorizedNode = {
  category: string;
  secondaryCategories: readonly string[];
};

const ALL_TAB: ToolboxTab = { key: TOOLBOX_ALL_TAB_KEY, label: "所有模块", icon: "fa:Light_AlignJustify" };
const FAVORITES_TAB: ToolboxTab = {
  key: TOOLBOX_FAVORITES_TAB_KEY,
  label: "模块收藏夹",
  icon: "fa:Light_Bookmark",
};

/** Opening the action editor prefers favorites when any catalog module is starred. */
export function preferredToolboxTabKey(hasCatalogFavorite: boolean): string {
  return hasCatalogFavorite ? TOOLBOX_FAVORITES_TAB_KEY : TOOLBOX_ALL_TAB_KEY;
}

/**
 * Tab strip from the host catalog (`GetStepRunnersResponse.categories`, same table as the WPF toolbox).
 * Older hosts send no categories; then every category referenced by a module gets a plain tab so no
 * module can disappear behind a missing tab.
 */
export function buildToolboxTabs(
  categories: readonly StepRunnerCategoryInfo[],
  nodes: readonly ToolboxCategorizedNode[],
  includeFavorites = false,
): ToolboxTab[] {
  const tabs: ToolboxTab[] = includeFavorites ? [FAVORITES_TAB, ALL_TAB] : [ALL_TAB];
  const seen = new Set<string>([TOOLBOX_ALL_TAB_KEY, TOOLBOX_FAVORITES_TAB_KEY]);
  for (const c of [...categories].sort((a, b) => a.order - b.order)) {
    const key = (c.key ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tabs.push({
      key,
      label: (c.label ?? "").trim() || key,
      icon: (c.icon ?? "").trim() || "fa:Light_Cog"
    });
  }
  if (categories.length > 0) {
    return tabs;
  }
  for (const key of [...collectToolboxCategoryKeys(nodes)].sort((a, b) => a.localeCompare(b))) {
    if (key === TOOLBOX_ALL_TAB_KEY || seen.has(key)) continue;
    seen.add(key);
    tabs.push({ key, label: key, icon: "fa:Light_Cog" });
  }
  return tabs;
}

/** Favorites are keyed by the parent runner, so every matching parent keeps its complete child tree. */
export function toolboxNodeInTab(
  node: ToolboxCategorizedNode & { key: string },
  tabKey: string,
  favoriteKeys: ReadonlySet<string>,
): boolean {
  if (tabKey === TOOLBOX_FAVORITES_TAB_KEY) {
    return favoriteKeys.has(node.key);
  }
  return toolboxNodeInCategory(node, tabKey);
}

/** Matches WPF `PassesCategoryFilter`: primary or any secondary category. */
export function toolboxNodeInCategory(node: ToolboxCategorizedNode, tabKey: string): boolean {
  if (!tabKey || tabKey === TOOLBOX_ALL_TAB_KEY) {
    return true;
  }
  return node.category === tabKey || node.secondaryCategories.includes(tabKey);
}

/** Favorites first, then all, then the remaining tabs in the given catalog order. */
export function visibleToolboxTabs(
  tabs: readonly ToolboxTab[],
  visibleKeys: ReadonlySet<string>,
): ToolboxTab[] {
  return tabs
    .filter((tab) => visibleKeys.has(tab.key))
    .sort((a, b) => toolboxTabPinRank(a.key) - toolboxTabPinRank(b.key));
}

function toolboxTabPinRank(key: string): number {
  if (key === TOOLBOX_FAVORITES_TAB_KEY) {
    return 0;
  }
  if (key === TOOLBOX_ALL_TAB_KEY) {
    return 1;
  }
  return 2;
}

/** Tab keys that have at least one of the given modules (always includes the "all" tab). */
export function collectToolboxCategoryKeys(nodes: readonly ToolboxCategorizedNode[]): Set<string> {
  const set = new Set<string>([TOOLBOX_ALL_TAB_KEY]);
  for (const node of nodes) {
    if (node.category) {
      set.add(node.category);
    }
    for (const c of node.secondaryCategories) {
      if (c) {
        set.add(c);
      }
    }
  }
  return set;
}
