import {
  buildQuickerKnowledgeKeywordIndex,
  type QuickerKnowledgeSearchIndex,
} from "@/lib/quicker-knowledge/search";
import {
  loadQuickerKnowledgeCorpusSnapshot,
  resolveDefaultQuickerKnowledgeChunksPath,
} from "@/lib/quicker-knowledge/store.server";

export type QuickerKnowledgeKeywordSnapshot = {
  index: QuickerKnowledgeSearchIndex;
  revision: string;
  retrievedAt: string;
};

/** Verify current file bytes before reusing the one owned keyword index. */
export function createQuickerKnowledgeIndexLoader(dependencies: {
  readSnapshot?: typeof loadQuickerKnowledgeCorpusSnapshot;
  buildIndex?: typeof buildQuickerKnowledgeKeywordIndex;
} = {}) {
  const readSnapshot = dependencies.readSnapshot ?? loadQuickerKnowledgeCorpusSnapshot;
  const buildIndex = dependencies.buildIndex ?? buildQuickerKnowledgeKeywordIndex;
  let sequence = 0;
  let settledSequence = 0;
  let cached: { key: string; index: QuickerKnowledgeSearchIndex } | undefined;

  return async (corpusPath?: string): Promise<QuickerKnowledgeKeywordSnapshot> => {
    const ownSequence = ++sequence;
    try {
      const snapshot = await readSnapshot(corpusPath ?? resolveDefaultQuickerKnowledgeChunksPath());
      const key = JSON.stringify([snapshot.corpusPath, snapshot.revision]);
      const index = cached?.key === key ? cached.index : buildIndex(snapshot.chunks);
      // Older callers retain their own snapshot; they cannot undo a newer read or failure.
      if (ownSequence >= settledSequence) {
        cached = { key, index };
        settledSequence = ownSequence;
      }
      return { index, revision: snapshot.revision, retrievedAt: snapshot.retrievedAt };
    } catch (error) {
      if (ownSequence >= settledSequence) {
        cached = undefined;
        settledSequence = ownSequence;
      }
      throw error;
    }
  };
}
