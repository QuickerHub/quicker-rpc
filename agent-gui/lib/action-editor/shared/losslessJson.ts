/**
 * Numbers JavaScript cannot reproduce remain opaque scalars. Map cannot occur in
 * source JSON and survives structuredClone, without string sentinels or global state.
 */
const NUMBER_TOKEN_KEY = "quicker.json.number";
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

export type LosslessJsonNumber = Map<string, string>;

export function isLosslessJsonNumber(value: unknown): value is LosslessJsonNumber {
  return value instanceof Map && value.size === 1
    && typeof value.get(NUMBER_TOKEN_KEY) === "string" && NUMBER_PATTERN.test(value.get(NUMBER_TOKEN_KEY)!);
}

export function losslessJsonNumberText(value: LosslessJsonNumber): string {
  if (!isLosslessJsonNumber(value)) throw new TypeError("Invalid lossless JSON number");
  return value.get(NUMBER_TOKEN_KEY)!;
}

export function parseLosslessJson(content: string): unknown {
  const text = content.replace(/^\uFEFF/, "");
  // Validate first. None of the rounded values from this parse are used below.
  JSON.parse(text);
  const tokens = [...text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)];
  let cursor = 0;
  const readValue = (): unknown => {
    const token = tokens[cursor++]![0];
    if (token === "{") {
      const result: Record<string, unknown> = {};
      while (tokens[cursor]![0] !== "}") {
        const key = JSON.parse(tokens[cursor++]![0]) as string;
        cursor++;
        // __proto__ is an ordinary JSON property, not a prototype setter.
        Object.defineProperty(result, key, { value: readValue(), writable: true, enumerable: true, configurable: true });
        if (tokens[cursor]![0] !== ",") break;
        cursor++;
      }
      cursor++;
      return result;
    }
    if (token === "[") {
      const result: unknown[] = [];
      while (tokens[cursor]![0] !== "]") {
        result.push(readValue());
        if (tokens[cursor]![0] !== ",") break;
        cursor++;
      }
      cursor++;
      return result;
    }
    if (token.startsWith('"')) return JSON.parse(token) as string;
    if (NUMBER_PATTERN.test(token)) {
      const value = Number(token);
      if (JSON.stringify(value) === token && (!Number.isInteger(value) || Number.isSafeInteger(value))) return value;
      return new Map([[NUMBER_TOKEN_KEY, token]]);
    }
    return token === "true" ? true : token === "false" ? false : null;
  };
  return readValue();
}

/** JSON.stringify semantics for document data, with opaque numeric tokens emitted verbatim. */
export function stringifyLosslessJson(value: unknown, space: string | number = 0): string {
  const gap = typeof space === "number" ? " ".repeat(Math.min(10, Math.max(0, Math.trunc(space) || 0))) : space.slice(0, 10);
  const parents = new Set<object>();
  const encode = (input: unknown, depth: number, key: string): string | undefined => {
    if (isLosslessJsonNumber(input)) return losslessJsonNumberText(input);
    let current = input;
    if (current !== null && typeof current === "object" && "toJSON" in current && typeof current.toJSON === "function") {
      current = current.toJSON(key);
      if (isLosslessJsonNumber(current)) return losslessJsonNumberText(current);
    }
    if (current === null || typeof current !== "object") return JSON.stringify(current);
    if (parents.has(current)) throw new TypeError("Converting circular structure to JSON");
    parents.add(current);
    const indent = gap.repeat(depth);
    const nestedIndent = gap.repeat(depth + 1);
    const finish = (open: string, close: string, entries: string[]) => entries.length === 0 ? `${open}${close}`
      : gap ? `${open}\n${nestedIndent}${entries.join(`,\n${nestedIndent}`)}\n${indent}${close}` : `${open}${entries.join(",")}${close}`;
    let result: string;
    if (Array.isArray(current)) {
      result = finish("[", "]", Array.from({ length: current.length }, (_, index) => encode(current[index], depth + 1, String(index)) ?? "null"));
    } else {
      const entries: string[] = [];
      for (const property of Object.keys(current)) {
        const encoded = encode((current as Record<string, unknown>)[property], depth + 1, property);
        if (encoded !== undefined) entries.push(`${JSON.stringify(property)}:${gap ? " " : ""}${encoded}`);
      }
      result = finish("{", "}", entries);
    }
    parents.delete(current);
    return result;
  };
  const result = encode(value, 0, "");
  if (result === undefined) throw new TypeError("Document is not a JSON value");
  return result;
}
