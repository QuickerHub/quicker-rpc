/** Parse a string that looks like JSON; returns null if not JSON. */
export function tryParseJsonString(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const first = trimmed[0];
  if (first !== "{" && first !== "[") return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

/** Normalize unknown values to pretty-printed JSON (or plain text). */
export function formatJsonDisplayText(value: unknown): string {
  if (typeof value === "string") {
    const parsed = tryParseJsonString(value);
    if (parsed !== null) {
      return JSON.stringify(parsed, null, 2);
    }
    return value;
  }
  if (value === undefined) return "undefined";
  if (typeof value === "bigint") return value.toString();
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

const JSON_EDITOR_MIN_CHARS = 320;

/** Use scrollable highlighted editor instead of inline pre/plain text. */
export function shouldUseJsonEditor(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return false;

  let display: unknown = value;
  if (typeof value === "string") {
    const parsed = tryParseJsonString(value);
    display = parsed ?? value;
  }

  const text = formatJsonDisplayText(display);
  return text.length >= JSON_EDITOR_MIN_CHARS || text.includes("\n");
}
