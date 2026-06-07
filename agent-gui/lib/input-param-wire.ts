/** Compact wire inputParams for workspace data.json. */

export type WireInputParam = {
  varKey?: string;
  value?: string;
  file?: string;
};

export type WireBindKind = "value" | "file" | "var";

export const FILE_KEY_SUFFIX = ".file";
export const VAR_KEY_SUFFIX = ".var";

function startsWithIgnoreCase(text: string, prefix: string): boolean {
  return text.length >= prefix.length
    && text.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase();
}

function normalizeFileRef(path: string): string {
  return path.trim().replace(/\\/g, "/");
}

function endsWithIgnoreCase(text: string, suffix: string): boolean {
  return text.length >= suffix.length
    && text.slice(-suffix.length).toLowerCase() === suffix.toLowerCase();
}

/** Parse compact wire key: `expression.file` → base + kind. */
export function parseWireParamKey(wireKey: string): { baseKey: string; kind: WireBindKind } {
  if (endsWithIgnoreCase(wireKey, FILE_KEY_SUFFIX)) {
    return {
      baseKey: wireKey.slice(0, -FILE_KEY_SUFFIX.length),
      kind: "file",
    };
  }
  if (endsWithIgnoreCase(wireKey, VAR_KEY_SUFFIX)) {
    return {
      baseKey: wireKey.slice(0, -VAR_KEY_SUFFIX.length),
      kind: "var",
    };
  }
  return { baseKey: wireKey, kind: "value" };
}

/** Parse @var: / @file: / @value: legacy patch strings. */
export function parseTypedWireString(text: string): WireInputParam | null {
  if (startsWithIgnoreCase(text, "@var:")) {
    const key = text.slice(5).trim();
    return key ? { varKey: key } : null;
  }
  if (startsWithIgnoreCase(text, "@file:")) {
    const path = normalizeFileRef(text.slice(6));
    return path ? { file: path } : null;
  }
  if (startsWithIgnoreCase(text, "@value:")) {
    return { value: text.slice(7) };
  }
  return null;
}

function mergeWireParam(existing: WireInputParam | undefined, patch: WireInputParam): WireInputParam {
  return { ...existing, ...patch };
}

function coerceLegacyObject(raw: Record<string, unknown>): WireInputParam {
  const out: WireInputParam = {};
  const varKey = raw.varKey ?? raw.VarKey;
  const value = raw.value ?? raw.Value;
  const file = raw.file ?? raw.File;
  if (typeof varKey === "string" && varKey.trim()) out.varKey = varKey.trim();
  if (typeof value === "string") out.value = value;
  if (typeof file === "string" && file.trim()) {
    out.file = file.trim().replace(/\\/g, "/");
  }
  return out;
}

function coerceWireEntry(raw: unknown, kind: WireBindKind): WireInputParam {
  if (raw === null || raw === undefined) {
    return {};
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return coerceLegacyObject(raw as Record<string, unknown>);
  }
  if (typeof raw !== "string") {
    return { value: String(raw) };
  }
  if (kind === "file") {
    return { file: normalizeFileRef(raw) };
  }
  if (kind === "var") {
    return { varKey: raw.trim() };
  }
  const typed = parseTypedWireString(raw);
  if (typed) {
    return typed;
  }
  return { value: raw };
}

/** Expand compact wire keys in inputParams → canonical map keyed by param name. */
export function expandWireInputParams(
  raw: Record<string, unknown> | undefined,
): Record<string, WireInputParam> {
  const merged: Record<string, WireInputParam> = {};
  for (const [wireKey, value] of Object.entries(raw ?? {})) {
    const { baseKey, kind } = parseWireParamKey(wireKey);
    merged[baseKey] = mergeWireParam(merged[baseKey], coerceWireEntry(value, kind));
  }
  return merged;
}

/** Compact canonical param to wire key + plain string value. */
export function compactWireInputParam(
  paramKey: string,
  param: WireInputParam,
): Record<string, string> {
  const file = param.file?.trim();
  const varKey = param.varKey?.trim();
  if (file) {
    return { [`${paramKey}${FILE_KEY_SUFFIX}`]: normalizeFileRef(file) };
  }
  if (varKey) {
    return { [`${paramKey}${VAR_KEY_SUFFIX}`]: varKey };
  }
  if (typeof param.value === "string" && param.value.length > 0) {
    return { [paramKey]: param.value };
  }
  return {};
}

/** Expand one scalar/object token (legacy helper). */
export function coerceWireInputParam(raw: unknown): WireInputParam {
  return coerceWireEntry(raw, "value");
}
