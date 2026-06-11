import {
  loadSlashUsageMap,
  slashUsageKey,
  topRecentSlashKeys,
} from "@/lib/composer-slash-usage-prefs";

export type SlashCatalogSource = {
  commands: {
    name: string;
    description: string;
    argumentHint?: string | null;
    scope: string;
  }[];
  skills: { name: string; description: string; scope: string }[];
  agents: { name: string; description: string; scope: string }[];
};

export type SlashItemKind = "command" | "skill" | "agent";

export type SlashCatalogItem = {
  kind: SlashItemKind;
  name: string;
  description: string;
  scope: string;
  argumentHint?: string | null;
};

/** Bundled skills surfaced first when slash query is empty. */
export const RECOMMENDED_SKILL_NAMES = [
  "quicker-authoring",
  "quicker-eval-expression",
  "qkrpc",
  "quicker-sync",
  "quicker-run",
] as const;

const SCOPE_SCORE: Record<string, number> = {
  workspace: 40,
  user: 28,
  bundled: 12,
};

const KIND_SCORE: Record<SlashItemKind, number> = {
  command: 18,
  skill: 14,
  agent: 10,
};

const FILTERED_LIMIT = 24;

/** Visible rows per section before "Show more" (empty query). */
export const SLASH_SECTION_COLLAPSED_LIMIT = 5;

const SECTION_ORDER: SlashItemKind[] = ["skill", "command", "agent"];

function scopeScore(scope: string): number {
  return SCOPE_SCORE[scope] ?? 0;
}

function recommendedSkillBoost(name: string, query: string): number {
  if (query.trim()) return 0;
  const idx = RECOMMENDED_SKILL_NAMES.findIndex(
    (n) => n.toLowerCase() === name.toLowerCase(),
  );
  if (idx < 0) return 0;
  return 50 - idx * 4;
}

function usageScore(kind: SlashItemKind, name: string): number {
  const entry = loadSlashUsageMap()[slashUsageKey(kind, name)];
  if (!entry) return 0;
  const ageDays = (Date.now() - entry.lastUsedAt) / (1000 * 60 * 60 * 24);
  const recency = Math.max(0, 30 - ageDays * 3);
  return entry.count * 8 + recency;
}

function recentBoost(key: string, recentKeys: string[]): number {
  const idx = recentKeys.indexOf(key);
  if (idx < 0) return 0;
  return 60 - idx * 8;
}

function matchScore(item: SlashCatalogItem, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const name = item.name.toLowerCase();
  if (name === q) return 120;
  if (name.startsWith(q)) return 90;
  if (name.includes(q)) return 70;
  if (item.description.toLowerCase().includes(q)) return 40;
  return -1;
}

function scoreItem(
  item: SlashCatalogItem,
  query: string,
  recentKeys: string[],
): number {
  const match = matchScore(item, query);
  if (query.trim() && match < 0) return -1;

  const key = slashUsageKey(item.kind, item.name);
  return (
    (match > 0 ? match : 0)
    + scopeScore(item.scope)
    + KIND_SCORE[item.kind]
    + usageScore(item.kind, item.name)
    + recentBoost(key, recentKeys)
    + recommendedSkillBoost(item.name, query)
  );
}

export function buildSlashCatalogItems(
  catalog: SlashCatalogSource,
): SlashCatalogItem[] {
  const commands: SlashCatalogItem[] = catalog.commands.map((c) => ({
    kind: "command",
    name: c.name,
    description: c.description,
    scope: c.scope,
    argumentHint: c.argumentHint,
  }));
  const skills: SlashCatalogItem[] = catalog.skills.map((s) => ({
    kind: "skill",
    name: s.name,
    description: s.description,
    scope: s.scope,
  }));
  const agents: SlashCatalogItem[] = catalog.agents.map((a) => ({
    kind: "agent",
    name: a.name,
    description: a.description,
    scope: a.scope,
  }));
  return [...commands, ...skills, ...agents];
}

export function rankSlashCatalogItems(
  items: SlashCatalogItem[],
  query: string,
  options?: { limit?: number | null },
): SlashCatalogItem[] {
  const recentKeys = topRecentSlashKeys(8);
  const scored = items
    .map((item) => ({
      item,
      score: scoreItem(item, query, recentKeys),
    }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.name.localeCompare(b.item.name, undefined, {
        sensitivity: "base",
      });
    });

  const defaultLimit = query.trim() ? FILTERED_LIMIT : null;
  const limit = options?.limit !== undefined ? options.limit : defaultLimit;
  const rows = limit === null ? scored : scored.slice(0, limit);
  return rows.map((row) => row.item);
}

export type SlashMenuSection = {
  kind: SlashItemKind;
  heading: string;
  items: SlashCatalogItem[];
  visibleItems: SlashCatalogItem[];
  hiddenCount: number;
};

export type SlashMenuModel = {
  sections: SlashMenuSection[];
  flatVisible: SlashCatalogItem[];
};

export function slashSectionHeading(kind: SlashItemKind): string {
  switch (kind) {
    case "skill":
      return "Skills";
    case "command":
      return "Commands";
    case "agent":
      return "Subagents";
  }
}

/** One-line preview; strips common markdown from skill/command descriptions. */
export function stripSlashDescriptionPreview(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSlashMenuModel(
  items: SlashCatalogItem[],
  query: string,
  expandedKinds: ReadonlySet<SlashItemKind>,
): SlashMenuModel {
  const ranked = rankSlashCatalogItems(items, query, { limit: null });
  const grouped = new Map<SlashItemKind, SlashCatalogItem[]>();
  for (const kind of SECTION_ORDER) grouped.set(kind, []);
  for (const item of ranked) {
    grouped.get(item.kind)?.push(item);
  }

  const hasQuery = query.trim().length > 0;
  const sections: SlashMenuSection[] = [];
  const flatVisible: SlashCatalogItem[] = [];

  for (const kind of SECTION_ORDER) {
    const sectionItems = grouped.get(kind) ?? [];
    if (sectionItems.length === 0) continue;

    const expanded = expandedKinds.has(kind) || hasQuery;
    const limit = expanded
      ? sectionItems.length
      : SLASH_SECTION_COLLAPSED_LIMIT;
    const visibleItems = sectionItems.slice(0, limit);
    const hiddenCount = expanded
      ? 0
      : Math.max(0, sectionItems.length - visibleItems.length);

    sections.push({
      kind,
      heading: slashSectionHeading(kind),
      items: sectionItems,
      visibleItems,
      hiddenCount,
    });
    flatVisible.push(...visibleItems);
  }

  return { sections, flatVisible };
}

export function filterSlashCatalogItems(
  items: SlashCatalogItem[],
  query: string,
): SlashCatalogItem[] {
  return buildSlashMenuModel(items, query, new Set()).flatVisible;
}

export function slashItemLabel(item: SlashCatalogItem): string {
  return `/${item.name}`;
}

export function slashItemInsertText(item: SlashCatalogItem): string {
  switch (item.kind) {
    case "command":
      return `/${item.name} `;
    case "skill":
      return `请加载并遵循 skill「${item.name}」：`;
    case "agent":
      return `请用 task 子代理「${item.name}」：`;
  }
}
