/** Client-safe types and helpers (no Node.js fs). */

export type ActionAuthoringReferenceMeta = {
  id: string;
  title: string;
  searchAliases?: string[];
};

export type ActionAuthoringTopicMeta = {
  topic: string;
  title: string;
  description: string;
  charCount: number;
  layer?: string;
  references?: ActionAuthoringReferenceMeta[];
};

export type ActionAuthoringDoc = {
  topic: string;
  title: string;
  description: string;
  markdown: string;
  /** Machine-readable schema when topic is action-data-schema, form-spec, … */
  schema?: Record<string, unknown>;
  reference?: string;
};

export type ActionAuthoringSearchItem = {
  topic: string;
  title: string;
  description: string;
  /** Short scan line for the hit list. */
  excerpt: string;
  /** Matched section or query neighborhood (~1.2k) — read this; no follow-up get required. */
  snippet: string;
  reference?: string;
  /** Matched section heading when search hit a document fragment. */
  section?: string;
  /** MiniSearch relevance score; omitted when query is empty. */
  score?: number;
};

/** docs search scope filter (default all). */
export const DOCS_SEARCH_SCOPES = ["references", "workflows", "all"] as const;
export type DocsSearchScope = (typeof DOCS_SEARCH_SCOPES)[number];

/** Topics where docs get may return embedded JSON schema (not full prose). */
export const DOCS_SCHEMA_TOPIC_IDS = new Set([
  "action-data-schema",
  "form-spec",
]);

/** Canonical agent routing — keep in sync with search-strategy-prompt, tool-routing, docs tool. */
export const DOCS_AGENT_ROUTING_HINT =
  "Known topic id (workflow or schema, e.g. action-data-schema, authoring-workflow) → docs get(topic). Unknown keyword → docs search → items[].snippet.";

export function docViewerEntryKey(topic: string, reference?: string): string {
  return reference ? `${topic}/${reference}` : topic;
}

/** Normalize reference id from docs get / API path segment. */
export function normalizeReferenceKey(file: string): string {
  return file
    .trim()
    .replace(/\\/g, "/")
    .replace(/^references\//, "")
    .replace(/\.md$/i, "")
    .toLowerCase();
}

/** Reject path traversal and absolute paths; allow nested catalog ids (examples/*, kc/*). */
export function isBlockedReferenceKey(refKey: string): boolean {
  return (
    refKey.includes("..")
    || refKey.startsWith("/")
    || /^[a-z]:/i.test(refKey)
  );
}

/** Topic layer order for docs_index / explorer catalog. */
export const ACTION_AUTHORING_LAYER_ORDER = [
  "router",
  "workflow",
  "schema",
  "catalog",
  "adjunct",
  "cli-only",
  "other",
] as const;

export const ACTION_AUTHORING_LAYER_LABELS: Record<string, string> = {
  router: "路由",
  workflow: "工作流",
  schema: "数据形状",
  catalog: "步骤模块",
  adjunct: "辅助",
  "cli-only": "CLI",
  other: "其他",
};

export type ActionAuthoringLayerGroup = {
  layer: string;
  label: string;
  topics: ActionAuthoringTopicMeta[];
};

export function groupTopicsByLayer(
  topics: ActionAuthoringTopicMeta[],
): ActionAuthoringLayerGroup[] {
  /** @type {Record<string, ActionAuthoringTopicMeta[]>} */
  const buckets: Record<string, ActionAuthoringTopicMeta[]> = {};
  for (const layer of ACTION_AUTHORING_LAYER_ORDER) {
    buckets[layer] = [];
  }
  for (const topic of topics) {
    const layer = topic.layer?.trim() || "other";
    if (!buckets[layer]) buckets[layer] = [];
    buckets[layer].push(topic);
  }
  const order = [
    ...ACTION_AUTHORING_LAYER_ORDER,
    ...Object.keys(buckets).filter(
      (layer) =>
        !ACTION_AUTHORING_LAYER_ORDER.includes(
          layer as (typeof ACTION_AUTHORING_LAYER_ORDER)[number],
        ),
    ),
  ];
  return order
    .filter((layer) => (buckets[layer]?.length ?? 0) > 0)
    .map((layer) => ({
      layer,
      label: ACTION_AUTHORING_LAYER_LABELS[layer] ?? layer,
      topics: buckets[layer]!.slice().sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      ),
    }));
}

export function sortTopicsByLayer(
  topics: ActionAuthoringTopicMeta[],
): ActionAuthoringTopicMeta[] {
  const layerRank = new Map<string, number>(
    ACTION_AUTHORING_LAYER_ORDER.map((layer, index) => [layer, index]),
  );
  return topics.slice().sort((a, b) => {
    const layerA = a.layer?.trim() || "other";
    const layerB = b.layer?.trim() || "other";
    const rankA = layerRank.get(layerA) ?? ACTION_AUTHORING_LAYER_ORDER.length;
    const rankB = layerRank.get(layerB) ?? ACTION_AUTHORING_LAYER_ORDER.length;
    if (rankA !== rankB) return rankA - rankB;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}
