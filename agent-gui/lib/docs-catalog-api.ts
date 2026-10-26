import type { ActionAuthoringTopicMeta } from "@/lib/action-authoring-docs.shared";
import { parseDocsGetValue, type DocsGetDoc, type DocsGuideSource } from "@/lib/docs-tool";

export async function fetchDocsCatalog(): Promise<ActionAuthoringTopicMeta[]> {
  const res = await fetch("/api/docs", { cache: "no-store" });
  const data = await res.json();
  if (!data.success || !Array.isArray(data.topics)) {
    throw new Error(
      typeof data.errorMessage === "string"
        ? data.errorMessage
        : "Failed to load docs catalog",
    );
  }
  return data.topics as ActionAuthoringTopicMeta[];
}

export async function fetchDocByTopic(topic: string, options?: { source?: DocsGuideSource; signal?: AbortSignal }): Promise<DocsGetDoc> {
  const suffix = options?.source === "gateway" ? "?source=gateway" : "";
  const res = await fetch(`/api/docs/${encodeURIComponent(topic)}${suffix}`, {
    cache: "no-store",
    signal: options?.signal,
  });
  const data = await res.json();
  const doc = parseDocsGetValue(data);
  if (!doc || (!data.success && doc.gatewayKnowledge?.status !== "unavailable")) {
    throw new Error(
      typeof data.errorMessage === "string"
        ? data.errorMessage
        : `Unknown topic: ${topic}`,
    );
  }
  return doc;
}

export async function fetchDocReference(
  topic: string,
  file: string,
): Promise<DocsGetDoc & { reference: string }> {
  const res = await fetch(
    `/api/docs/${encodeURIComponent(topic)}/reference/${encodeURIComponent(file)}`,
    { cache: "no-store" },
  );
  const data = await res.json();
  if (!data.success || typeof data.markdown !== "string") {
    throw new Error(
      typeof data.errorMessage === "string"
        ? data.errorMessage
        : `Unknown reference: ${topic}/${file}`,
    );
  }
  return {
    topic: data.topic,
    title: data.title,
    markdown: data.markdown,
    reference: data.reference,
  };
}
