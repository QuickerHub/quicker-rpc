const SENTENCE_END_RE = /[。！？；.!?;]\s*$/;
const CLAUSE_END_RE = /[，,、：:]\s*$/;
const MIN_CHUNK_CHARS = 8;
const MAX_BUFFER_CHARS = 48;

/** Pull speakable fragments from a growing LLM text stream. */
export function drainSpeakableChunks(buffer: string): {
  chunks: string[];
  rest: string;
} {
  const chunks: string[] = [];
  let rest = buffer;

  while (rest.length > 0) {
    const sentenceMatch = rest.match(/^([\s\S]*?[。！？；.!?;])\s*/);
    if (sentenceMatch?.[1]) {
      const chunk = sentenceMatch[1].trim();
      if (chunk) chunks.push(chunk);
      rest = rest.slice(sentenceMatch[0].length);
      continue;
    }

    if (rest.length >= MAX_BUFFER_CHARS) {
      const clauseMatch = rest.match(/^([\s\S]*?[，,、：:])\s*/);
      if (clauseMatch?.[1] && clauseMatch[1].trim().length >= MIN_CHUNK_CHARS) {
        const chunk = clauseMatch[1].trim();
        chunks.push(chunk);
        rest = rest.slice(clauseMatch[0].length);
        continue;
      }
      const hard = rest.slice(0, MAX_BUFFER_CHARS).trim();
      if (hard) chunks.push(hard);
      rest = rest.slice(MAX_BUFFER_CHARS);
      continue;
    }

    if (
      rest.length >= MIN_CHUNK_CHARS
      && (SENTENCE_END_RE.test(rest) || CLAUSE_END_RE.test(rest))
    ) {
      const chunk = rest.trim();
      if (chunk) chunks.push(chunk);
      rest = "";
      continue;
    }

    break;
  }

  return { chunks, rest };
}

/** Flush any remaining text when the LLM stream ends. */
export function flushSpeakableChunk(buffer: string): string | null {
  const trimmed = buffer.trim();
  return trimmed.length > 0 ? trimmed : null;
}
