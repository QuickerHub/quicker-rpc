export type ProgramDocumentMetadata = { title: string; description: string; icon: string };
export type ProgramDocumentMetadataPatch = Partial<ProgramDocumentMetadata>;

const aliases = {
  title: ["title", "Title"],
  description: ["description", "Description"],
  icon: ["icon", "Icon"],
} as const;

function readRaw(content: string): Record<string, unknown> {
  const raw: unknown = JSON.parse(content.replace(/^\uFEFF/, ""));
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Action metadata must be a JSON object");
  return raw as Record<string, unknown>;
}

/** JSON is validated first. Keep source spans and numeric lexemes so patching a title cannot round a legacy Int64. */
function inspect(content: string) {
  readRaw(content);
  const tokens = [...content.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)];
  let cursor = 0;
  let closingOffset = 0;
  const properties = new Map<string, { start: number; end: number }>();
  const value = (root = false): unknown => {
    const token = tokens[cursor++]!;
    if (token[0] === "{") {
      const entries: Array<[string, unknown]> = [];
      const keys = new Set<string>();
      while (tokens[cursor]![0] !== "}") {
        const key = JSON.parse(tokens[cursor++]![0]) as string;
        if (keys.has(key)) throw new Error(`Action metadata contains duplicate JSON key ${key}`);
        keys.add(key);
        cursor++; // colon
        const start = tokens[cursor]!.index!;
        entries.push([key, value()]);
        const last = tokens[cursor - 1]!;
        if (root) properties.set(key, { start, end: last.index! + last[0].length });
        if (tokens[cursor]![0] !== ",") break;
        cursor++;
      }
      if (root) closingOffset = tokens[cursor]!.index!;
      cursor++;
      return ["object", entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)];
    }
    if (token[0] === "[") {
      const values: unknown[] = [];
      while (tokens[cursor]![0] !== "]") {
        values.push(value());
        if (tokens[cursor]![0] !== ",") break;
        cursor++;
      }
      cursor++;
      return ["array", values];
    }
    if (token[0].startsWith('"')) return ["string", JSON.parse(token[0])];
    return [/^-?\d/.test(token[0]) ? "number" : "literal", token[0]];
  };
  const fingerprint = JSON.stringify(value(true));
  return { fingerprint, properties, closingOffset };
}

function readField(raw: Record<string, unknown>, field: keyof ProgramDocumentMetadata): string {
  const keys = aliases[field].filter((key) => Object.hasOwn(raw, key));
  for (const key of keys) {
    if (typeof raw[key] !== "string") throw new Error(`Action metadata ${key} must be a string`);
  }
  if (keys.length > 1 && raw[keys[0]!] !== raw[keys[1]!]) throw new Error(`Action metadata has conflicting ${field} aliases`);
  return keys.length ? raw[keys[0]!] as string : "";
}

/** Display values are original text; validation must not silently trim a user's draft. */
export function readProgramDocumentMetadata(content: string): ProgramDocumentMetadata {
  const raw = readRaw(content);
  inspect(content);
  return { title: readField(raw, "title"), description: readField(raw, "description"), icon: readField(raw, "icon") };
}

export function fingerprintProgramDocumentMetadataContent(content: string): string {
  readProgramDocumentMetadata(content);
  return inspect(content).fingerprint;
}

/** Patch only presentation fields, retaining every identity/version/extension field and its casing. */
export function patchProgramDocumentMetadata(content: string, patch: ProgramDocumentMetadataPatch): string {
  const raw = readRaw(content);
  readProgramDocumentMetadata(content);
  const source = inspect(content);
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const missing: Array<[string, string]> = [];
  for (const key of Object.keys(patch)) {
    if (!Object.hasOwn(aliases, key)) throw new Error(`Action metadata field ${key} is not editable`);
    const field = key as keyof ProgramDocumentMetadata;
    const value = patch[field];
    if (typeof value !== "string") throw new Error(`Action metadata ${field} must be a string`);
    const presentKeys = aliases[field].filter((alias) => Object.hasOwn(raw, alias));
    // Missing fields use the document's existing style rather than rewriting its other keys.
    const fallback = Object.values(aliases).some((pair) => Object.hasOwn(raw, pair[1])) ? aliases[field][1] : field;
    for (const alias of presentKeys.length ? presentKeys : [fallback]) {
      if (raw[alias] === value) continue;
      const span = source.properties.get(alias);
      if (span) replacements.push({ ...span, text: JSON.stringify(value) });
      else missing.push([alias, value]);
    }
  }
  if (missing.length) replacements.push({ start: source.closingOffset, end: source.closingOffset,
    text: `${source.properties.size ? "," : ""}\n${missing.map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(",\n")}\n`,
  });
  let result = content;
  for (const patch of replacements.sort((a, b) => b.start - a.start)) result = result.slice(0, patch.start) + patch.text + result.slice(patch.end);
  return result;
}

export function validateProgramDocumentMetadataForSave(content: string): void {
  if (!readProgramDocumentMetadata(content).title.trim()) throw new Error("Action title cannot be empty");
}
