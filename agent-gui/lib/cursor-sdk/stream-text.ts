/** Compute the next assistant text delta from a Cursor SDK assistant event. */
export function computeAssistantTextDelta(
  fullText: string,
  emittedText: string,
): string | null {
  if (!fullText) return null;
  if (!emittedText) return fullText;
  if (fullText.startsWith(emittedText)) {
    const delta = fullText.slice(emittedText.length);
    return delta || null;
  }
  if (fullText.length <= emittedText.length && emittedText.includes(fullText)) {
    return null;
  }
  // SDK may emit suffix-only chunks between cumulative snapshots.
  return fullText;
}

export function mergeEmittedAssistantText(
  emittedText: string,
  fullText: string,
  delta: string,
): string {
  if (!emittedText) return fullText;
  if (fullText.startsWith(emittedText)) return fullText;
  return emittedText + delta;
}
