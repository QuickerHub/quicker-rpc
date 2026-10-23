/** Helpers for `action get` payloads (metadata bootstrap). */
import { parseQkrpcJson } from "./qkrpc-json";
import { normalizeActionProjectEditVersion, isInvalidActionProjectEditVersion, type ActionProjectEditVersion } from "./action-project-edit-version";

/** Quicker may return 0 when LastEditTimeUtc is unset — treat as missing. */
export function normalizeEditVersion(
  value: unknown,
): ActionProjectEditVersion | undefined {
  return normalizeActionProjectEditVersion(value);
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
      const parsed = parseQkrpcJson(compressed);
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
): ActionProjectEditVersion | undefined {
  if (!payload) return undefined;
  if (hasImpreciseEditVersionFromGetPayload(payload)) return undefined;
  for (const key of ["editVersion", "EditVersion"]) {
    const value = payload[key];
    const normalized = normalizeEditVersion(value);
    if (normalized != null) return normalized;
  }
  const compressed = readCompressedFromGetPayload(payload);
  if (compressed) {
    for (const key of ["editVersion", "EditVersion"]) {
      const value = compressed[key];
      const normalized = normalizeEditVersion(value);
      if (normalized != null) return normalized;
    }
  }
  return undefined;
}

/** Invalid/previously rounded inputs must not be mistaken for a missing legacy version. */
export function hasImpreciseEditVersionFromGetPayload(payload: Record<string, unknown> | null): boolean {
  for (const record of [payload, readCompressedFromGetPayload(payload)]) {
    if (!record) continue;
    for (const key of ["editVersion", "EditVersion"]) {
      const value = record[key];
      if (isInvalidActionProjectEditVersion(value)) return true;
    }
  }
  return false;
}
