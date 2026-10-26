import type { StructuredToolResult } from "@/lib/tool-result";

/** Consolidated authoring guide tool. */
export const DOCS_TOOL = "docs";

/** @deprecated Use docs with action=get */
export const DOCS_GET_TOOL = "docs_get";
/** @deprecated Use docs with action=search */
export const DOCS_GET_REFERENCE_TOOL = "docs_get_reference";
/** @deprecated Use docs with action=search */
export const DOCS_SEARCH_TOOL = "docs_search";
/** @deprecated Use docs with action=index */
export const DOCS_INDEX_TOOL = "docs_index";

export function isDocsTool(toolName: string): boolean {
  return (
    toolName === DOCS_TOOL
    || toolName === DOCS_GET_TOOL
    || toolName === DOCS_GET_REFERENCE_TOOL
    || toolName === DOCS_SEARCH_TOOL
    || toolName === DOCS_INDEX_TOOL
  );
}

export function isDocsGetOpenableTool(
  toolName: string,
  input?: unknown,
): boolean {
  if (toolName === DOCS_GET_TOOL || toolName === DOCS_GET_REFERENCE_TOOL) {
    return true;
  }
  if (toolName !== DOCS_TOOL) return false;
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return (input as Record<string, unknown>).action === "get";
  }
  return false;
}

export type DocsGuideSource = "local" | "gateway";

/** Gateway observations describe this guide read, never native editing authority. */
export type GatewayGuideKnowledge = {
  status: "available" | "unknown" | "unavailable";
  gateway: { transport: "http" | "cli"; identity: string; displayName: string };
  retrievedAt: string;
  codec: Record<string, unknown> | null;
  provenance: Record<string, unknown> | null;
  reason?: string;
};

export type DocsGetDoc = {
  topic: string;
  title: string;
  description?: string;
  markdown: string;
  reference?: string;
  guideSource?: DocsGuideSource;
  gatewayKnowledge?: GatewayGuideKnowledge;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function parseGatewayGuideKnowledge(value: unknown): GatewayGuideKnowledge | undefined {
  const data = record(value);
  const gateway = record(data?.gateway);
  if (!data || !gateway || !["available", "unknown", "unavailable"].includes(String(data.status))
    || !["http", "cli"].includes(String(gateway.transport))
    || typeof gateway.identity !== "string" || !gateway.identity
    || typeof gateway.displayName !== "string" || typeof data.retrievedAt !== "string") return;
  return {
    status: data.status as GatewayGuideKnowledge["status"],
    gateway: { transport: gateway.transport as "http" | "cli", identity: gateway.identity, displayName: gateway.displayName },
    retrievedAt: data.retrievedAt,
    codec: record(data.codec), provenance: record(data.provenance),
    ...(typeof data.reason === "string" ? { reason: data.reason } : {}),
  };
}

/** Shared API/tool parser. Failed gateway reads remain inspectable without local fallback. */
export function parseDocsGetValue(data: unknown): DocsGetDoc | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.markdown !== "string") return null;
  const topic = typeof d.topic === "string" ? d.topic : "doc";
  const title = typeof d.title === "string" && d.title.trim()
    ? d.title.trim()
    : topic;
  const description =
    typeof d.description === "string" && d.description.trim()
      ? d.description.trim()
      : undefined;
  const reference =
    typeof d.reference === "string" && d.reference.trim()
      ? d.reference.trim()
      : undefined;
  const guideSource = d.guideSource === "gateway" ? "gateway" : "local";
  const gatewayKnowledge = guideSource === "gateway" ? parseGatewayGuideKnowledge(d.gatewayKnowledge) : undefined;
  if (guideSource === "gateway" && !gatewayKnowledge) return null;
  return { topic, title, description, markdown: d.markdown, reference, guideSource, gatewayKnowledge };
}

export function parseDocsGetDoc(output: StructuredToolResult): DocsGetDoc | null {
  if (output.source !== "local") return null;
  const data = record(output.data);
  if (data?.action !== "docs-get") return null;
  const doc = parseDocsGetValue(data);
  if (!output.ok && doc?.gatewayKnowledge?.status !== "unavailable") return null;
  return doc;
}

export function parseDocsGetMarkdown(output: StructuredToolResult): string | null {
  return parseDocsGetDoc(output)?.markdown ?? null;
}

export function summarizeDocsToolOutput(
  toolName: string,
  output: StructuredToolResult,
): string | null {
  if (!output.ok || output.source !== "local") return null;
  const data = output.data;
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;

  const isGet =
    toolName === DOCS_GET_TOOL
    || toolName === DOCS_GET_REFERENCE_TOOL
    || (toolName === DOCS_TOOL && d.docsAction === "get");

  if (isGet && typeof d.title === "string") {
    const topic = typeof d.topic === "string" ? d.topic : "";
    const ref =
      typeof d.reference === "string" && d.reference
        ? ` · ${d.reference}`
        : "";
    return topic ? `${d.title} · ${topic}${ref}` : `${d.title}${ref}`;
  }

  const isSearch =
    toolName === DOCS_SEARCH_TOOL
    || (toolName === DOCS_TOOL && d.docsAction === "search");

  if (isSearch && Array.isArray(d.items)) {
    const n = typeof d.matchCount === "number" ? d.matchCount : d.items.length;
    const kw = typeof d.keyword === "string" && d.keyword ? ` · ${d.keyword}` : "";
    return `${n} 条结果${kw}`;
  }

  const isIndex =
    toolName === DOCS_INDEX_TOOL
    || (toolName === DOCS_TOOL && d.docsAction === "index");

  if (isIndex && Array.isArray(d.topics)) {
    return `${d.topics.length} 个主题`;
  }

  return null;
}
