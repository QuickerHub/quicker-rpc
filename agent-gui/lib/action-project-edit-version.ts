/** JSON-safe, exact host CAS version. Small integers retain the existing number representation. */
export type ActionProjectEditVersion = number | string;

const MAX_VERSION = 9223372036854775807n;

export function normalizeActionProjectEditVersion(value: unknown): ActionProjectEditVersion | undefined {
  if (typeof value === "number" && !Number.isSafeInteger(value)) return undefined;
  if (typeof value !== "number" && typeof value !== "string" && typeof value !== "bigint") return undefined;
  const text = String(value);
  if (!/^\d+$/.test(text)) return undefined;
  const version = BigInt(text);
  if (version <= 0n || version > MAX_VERSION) return undefined;
  return version <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(version) : version.toString();
}

/** Zero is the legacy missing-version sentinel; an explicit invalid value must never reuse sync trust. */
export function isInvalidActionProjectEditVersion(value: unknown): boolean {
  return value != null && value !== 0 && value !== "0" && normalizeActionProjectEditVersion(value) == null;
}

export function comparePreciseActionProjectEditVersions(left: ActionProjectEditVersion, right: ActionProjectEditVersion): -1 | 0 | 1 {
  const a = normalizeActionProjectEditVersion(left);
  const b = normalizeActionProjectEditVersion(right);
  if (a == null || b == null) throw new Error("Precise positive edit versions are required");
  return BigInt(a) === BigInt(b) ? 0 : BigInt(a) < BigInt(b) ? -1 : 1;
}
