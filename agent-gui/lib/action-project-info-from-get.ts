/** Helpers for `action get` payloads (metadata bootstrap). */

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
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}
