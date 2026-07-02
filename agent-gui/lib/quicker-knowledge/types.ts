export type QuickerKnowledgeSourceType =
  | "manual"
  | "action_dev"
  | "kb"
  | "docs_index"
  | "unknown";

export type QuickerKnowledgePage = {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  sourceType: QuickerKnowledgeSourceType;
  fetchedAt: string;
  contentHash: string;
  links: string[];
};

export type QuickerKnowledgeChunk = {
  id: string;
  pageId: string;
  url: string;
  title: string;
  sectionPath: string[];
  sourceType: QuickerKnowledgeSourceType;
  text: string;
  tokenEstimate: number;
  contentHash: string;
};

export type QuickerKnowledgeSearchResult = {
  chunkId: string;
  title: string;
  url: string;
  sectionPath: string[];
  sourceType: QuickerKnowledgeSourceType;
  score: number;
  snippet: string;
};
