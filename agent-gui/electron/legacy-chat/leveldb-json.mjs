export function markerByteVariants(marker) {
  const utf8 = Buffer.from(marker, "utf8");
  const utf16 = Buffer.alloc(marker.length * 2);
  for (let i = 0; i < marker.length; i++) {
    utf16.writeUInt16LE(marker.charCodeAt(i), i * 2);
  }
  return [utf8, utf16];
}

function extractJsonUtf8FromOffset(bytes, start) {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let idx = start; idx < bytes.length; idx += 1) {
    const code = bytes[idx];
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
        const slice = bytes.subarray(start, idx + 1);
        try {
          return slice.toString("utf8");
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function findJsonStartAfterOffset(bytes, offset) {
  const searchEnd = Math.min(bytes.length, offset + 512);
  for (const version of [1, 2, 3]) {
    const prefix = Buffer.from(`{"version":${version}`, "utf8");
    for (let i = offset; i <= searchEnd - prefix.length; i += 1) {
      if (bytes.subarray(i, i + prefix.length).equals(prefix)) return i;
    }
    const utf16Prefix = Buffer.alloc(prefix.length * 2);
    for (let j = 0; j < prefix.length; j += 1) {
      utf16Prefix.writeUInt16LE(prefix[j], j * 2);
    }
    for (let i = offset; i <= searchEnd - utf16Prefix.length; i += 1) {
      if (bytes.subarray(i, i + utf16Prefix.length).equals(utf16Prefix)) return i;
    }
  }
  for (let i = offset; i < searchEnd - 1; i += 1) {
    if (bytes[i] === 0x7b && bytes[i + 1] === 0) return i;
  }
  return null;
}

function extractJsonUtf16FromOffset(bytes, start) {
  if (bytes[start] !== 0x7b || bytes[start + 1] !== 0) return null;
  let best = null;
  let bestLen = 0;
  for (let end = start + 2; end + 1 < bytes.length; end += 2) {
    if (bytes[end] === 0x7d && bytes[end + 1] === 0) {
      const len = end + 2 - start;
      if (len > bestLen) {
        const units = [];
        for (let o = start; o <= end; o += 2) {
          units.push(bytes.readUInt16LE(o));
        }
        try {
          const candidate = String.fromCharCode(...units);
          JSON.parse(candidate);
          best = candidate;
          bestLen = len;
        } catch {
          // try next
        }
      }
    }
  }
  return best;
}

function extractJsonPayloadFromOffset(bytes, offset) {
  const start = findJsonStartAfterOffset(bytes, offset);
  if (start === null) return null;
  if (bytes[start + 1] === 0) {
    return extractJsonUtf16FromOffset(bytes, start);
  }
  return extractJsonUtf8FromOffset(bytes, start);
}

export function extractJsonObjectsAfterMarker(content, marker) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const found = [];
  const seen = new Set();

  for (const markerBytes of markerByteVariants(marker)) {
    if (!markerBytes.length || bytes.length < markerBytes.length) continue;
    let offset = 0;
    while (offset + markerBytes.length <= bytes.length) {
      if (bytes.subarray(offset, offset + markerBytes.length).equals(markerBytes)) {
        const json = extractJsonPayloadFromOffset(bytes, offset + markerBytes.length);
        if (json) {
          try {
            JSON.parse(json);
            if (!seen.has(json)) {
              seen.add(json);
              found.push(json);
            }
          } catch {
            // skip invalid
          }
        }
        offset += 1;
      } else {
        offset += 1;
      }
    }
  }
  return found;
}
