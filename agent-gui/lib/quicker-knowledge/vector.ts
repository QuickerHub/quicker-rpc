import type {
  QuickerKnowledgeChunk,
  QuickerKnowledgeSearchResult,
} from "@/lib/quicker-knowledge/types";

export type QuickerKnowledgeVectorRecord = {
  chunkId: string;
  embedding: number[];
};

export type QuickerKnowledgeVectorIndex = {
  vectorByChunkId: Map<string, number[]>;
  chunkById: Map<string, QuickerKnowledgeChunk>;
};

export type SearchQuickerKnowledgeVectorsInput = {
  index: QuickerKnowledgeVectorIndex;
  queryEmbedding: number[];
  limit?: number;
};

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (let index = 0; index < a.length; index += 1) {
    const aValue = a[index]!;
    const bValue = b[index]!;
    dot += aValue * bValue;
    aMagnitude += aValue * aValue;
    bMagnitude += bValue * bValue;
  }

  if (aMagnitude === 0 || bMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

export function buildQuickerKnowledgeVectorIndex(
  chunks: QuickerKnowledgeChunk[],
  vectors: QuickerKnowledgeVectorRecord[],
): QuickerKnowledgeVectorIndex {
  return {
    vectorByChunkId: new Map(vectors.map((vector) => [vector.chunkId, vector.embedding])),
    chunkById: new Map(chunks.map((chunk) => [chunk.id, chunk])),
  };
}

export function searchQuickerKnowledgeVectors(
  input: SearchQuickerKnowledgeVectorsInput,
): QuickerKnowledgeSearchResult[] {
  const limit = clampLimit(input.limit);

  return [...input.index.vectorByChunkId.entries()]
    .flatMap(([chunkId, embedding]) => {
      const chunk = input.index.chunkById.get(chunkId);
      if (chunk == null) {
        return [];
      }

      return [
        {
          chunk,
          score: cosineSimilarity(input.queryEmbedding, embedding),
        },
      ];
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk, score }) => ({
      chunkId: chunk.id,
      title: chunk.title,
      url: chunk.url,
      sectionPath: chunk.sectionPath,
      sourceType: chunk.sourceType,
      score,
      snippet: chunk.text.slice(0, 360),
    }));
}

function clampLimit(limit = 6): number {
  if (!Number.isFinite(limit)) {
    return 6;
  }

  return Math.min(12, Math.max(1, Math.trunc(limit)));
}
