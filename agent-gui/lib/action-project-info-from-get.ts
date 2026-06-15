/** Helpers for `action get` payloads (metadata bootstrap). */

/** Quicker may return 0 when LastEditTimeUtc is unset — treat as missing. */
export function normalizeEditVersion(
  value: number | undefined,
): number | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.trunc(value);
}

export function readCompressedFromGetPayload(
  payload: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!payload) return null;
  const compressed = payload.compressed;
  if (typeof compressed === "object" && compressed !== null) {
    return compressed as Record<string, unknown>;
  }
  if (typeof compressed === "string" && compressed.trim()) {
    try {
      const parsed = JSON.parse(compressed) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function readEditVersionFromGetPayload(
  payload: Record<string, unknown> | null,
): number | undefined {
  if (!payload) return undefined;
  for (const key of ["editVersion", "EditVersion"]) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      const normalized = normalizeEditVersion(value);
      if (normalized != null) return normalized;
    }
  }
  const compressed = readCompressedFromGetPayload(payload);
  if (compressed) {
    for (const key of ["editVersion", "EditVersion"]) {
      const value = compressed[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        const normalized = normalizeEditVersion(value);
        if (normalized != null) return normalized;
      }
    }
  }
  return undefined;
}
