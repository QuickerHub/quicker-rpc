/**
 * Extract JSON blobs from Chromium LevelDB localStorage values (UTF-8 or UTF-16 LE).
 */

export function markerByteVariants(marker: string): Buffer[] {
  const utf8 = Buffer.from(marker, "utf8");
  const utf16 = Buffer.alloc(marker.length * 2);
  for (let i = 0; i < marker.length; i++) {
    utf16.writeUInt16LE(marker.charCodeAt(i), i * 2);
  }
  return [utf8, utf16];
}

function extractJsonUtf8FromOffset(bytes: Buffer, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let idx = start; idx < bytes.length; idx++) {
    const code = bytes[idx]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (code === 0x5c) {
        escape = true;
        continue;
      }
      if (code === 0x22) inString = false;
      continue;
    }

    if (code === 0x22) {
      inString = true;
      continue;
    }
    if (code === 0x7b) depth += 1;
    if (code === 0x7d) {
      depth -= 1;
      if (depth === 0) {
        return bytes.subarray(start, idx + 1).toString("utf8");
      }
    }
  }

  return null;
}

const UTF16_CHAT_STORE_PREFIX = Buffer.from('{"version":2', "utf16le");

function extractJsonUtf16LeFromOffset(bytes: Buffer, start: number): string | null {
  if (start + 1 >= bytes.length || bytes[start] !== 0x7b || bytes[start + 1] !== 0x00) {
    return null;
  }

  let best: string | null = null;
  let bestLen = 0;

  for (let end = start + 2; end + 1 < bytes.length; end += 2) {
    if (bytes[end] !== 0x7d || bytes[end + 1] !== 0x00) continue;
    const len = end + 2 - start;
    if (len <= bestLen) continue;
    const candidate = bytes.subarray(start, end + 2).toString("utf16le");
    try {
      JSON.parse(candidate);
      best = candidate;
      bestLen = len;
    } catch {
      /* keep scanning for a longer valid root object */
    }
  }

  return best;
}

function findJsonStartAfterOffset(bytes: Buffer, offset: number): number | null {
  const searchEnd = Math.min(bytes.length, offset + 256);
  const slice = bytes.subarray(offset, searchEnd);
  const utf16Rel = slice.indexOf(UTF16_CHAT_STORE_PREFIX);
  if (utf16Rel >= 0) return offset + utf16Rel;

  const utf8Rel = slice.indexOf('{"version":2');
  if (utf8Rel >= 0) return offset + utf8Rel;

  for (let i = 0; i + 1 < slice.length; i++) {
    if (slice[i] === 0x7b && slice[i + 1] === 0x00) {
      return offset + i;
    }
  }

  return null;
}

function isParseableJsonObject(json: string): boolean {
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null;
  } catch {
    return false;
  }
}

export function extractJsonPayloadFromOffset(bytes: Buffer, offset: number): string | null {
  const start = findJsonStartAfterOffset(bytes, offset);
  if (start == null) return null;

  if (start + 1 < bytes.length && bytes[start + 1] === 0x00) {
    return extractJsonUtf16LeFromOffset(bytes, start);
  }
  return extractJsonUtf8FromOffset(bytes, start);
}

export function extractJsonObjectsAfterMarker(
  content: Buffer,
  marker: string,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const markerBytes of markerByteVariants(marker)) {
    let offset = 0;
    while (offset <= content.length - markerBytes.length) {
      const at = content.indexOf(markerBytes, offset);
      if (at < 0) break;
      const json = extractJsonPayloadFromOffset(
        content,
        at + markerBytes.length,
      );
      if (json && isParseableJsonObject(json) && !seen.has(json)) {
        seen.add(json);
        found.push(json);
      }
      offset = at + 1;
    }
  }

  return found;
}
