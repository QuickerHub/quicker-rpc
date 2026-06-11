export type TailLinesPreview = {
  tail: string;
  omitted: number;
  lineCount: number;
};

/** Last N lines for streaming compact previews — O(n) single split. */
export function extractTailLinesPreview(
  content: string,
  maxLines: number,
): TailLinesPreview {
  if (!content) {
    return { tail: "", omitted: 0, lineCount: 0 };
  }

  let lineCount = 1;
  let lastBreak = -1;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) lineCount++;
  }

  if (lineCount <= maxLines) {
    return { tail: content, omitted: 0, lineCount };
  }

  const omitted = lineCount - maxLines;
  let breaksFound = 0;
  for (let i = content.length - 1; i >= 0; i--) {
    if (content.charCodeAt(i) === 10) {
      breaksFound++;
      if (breaksFound === maxLines) {
        lastBreak = i;
        break;
      }
    }
  }

  const tail = lastBreak >= 0 ? content.slice(lastBreak + 1) : content;
  return { tail, omitted, lineCount };
}

/** Cheap signature for memo compare during streaming (length + tail slice). */
export function streamingContentSignature(content: string): string {
  if (!content) return "0:";
  const tail = content.length > 64 ? content.slice(-64) : content;
  return `${content.length}:${tail}`;
}
