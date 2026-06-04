/** Client-safe types and helpers (no Node.js fs). */

export type ActionAuthoringReferenceMeta = {
  id: string;
  title: string;
};

export type ActionAuthoringTopicMeta = {
  topic: string;
  title: string;
  description: string;
  charCount: number;
  references?: ActionAuthoringReferenceMeta[];
};

export type ActionAuthoringDoc = {
  topic: string;
  title: string;
  description: string;
  markdown: string;
  reference?: string;
};

export type ActionAuthoringSearchItem = {
  topic: string;
  title: string;
  description: string;
  excerpt: string;
  reference?: string;
};

export function docViewerEntryKey(topic: string, reference?: string): string {
  return reference ? `${topic}/${reference}` : topic;
}
