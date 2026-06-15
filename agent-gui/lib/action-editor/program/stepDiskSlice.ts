import { parseNodePathTokens } from "@/lib/action-editor/program/resolveNodePath";

export type ProgramStepDiskSlice = {
  nodePath: string;
  content: string;
  contentHash: string;
  startLine: number;
  endLine: number;
};

export type ProgramStepDiskSliceResult =
  | { ok: true; slice: ProgramStepDiskSlice }
  | { ok: false; error: string };

function skipWhitespace(text: string, index: number): number {
  let i = index;
  while (i < text.length && /\s/.test(text[i]!)) {
    i += 1;
  }
  return i;
}

function readJsonStringEnd(text: string, start: number): number {
  if (text[start] !== '"') {
    throw new Error("expected JSON string");
  }
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === '"') {
      return i + 1;
    }
    i += 1;
  }
  throw new Error("unterminated JSON string");
}

function readJsonLiteralEnd(text: string, start: number): number {
  const ch = text[start];
  if (ch === "t") return start + 4;
  if (ch === "f") return start + 5;
  if (ch === "n") return start + 4;
  let i = start;
  while (i < text.length && /[-+0-9.eE]/.test(text[i]!)) {
    i += 1;
  }
  return i;
}

function jsonValueBounds(
  text: string,
  start: number,
): { start: number; end: number } {
  const valueStart = skipWhitespace(text, start);
  const ch = text[valueStart];
  if (ch === '"') {
    return { start: valueStart, end: readJsonStringEnd(text, valueStart) };
  }
  if (ch === "{") {
    let depth = 0;
    let i = valueStart;
    while (i < text.length) {
      const c = text[i]!;
      if (c === '"') {
        i = readJsonStringEnd(text, i);
        continue;
      }
      if (c === "{") depth += 1;
      if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          return { start: valueStart, end: i + 1 };
        }
      }
      i += 1;
    }
    throw new Error("unterminated JSON object");
  }
  if (ch === "[") {
    let depth = 0;
    let i = valueStart;
    while (i < text.length) {
      const c = text[i]!;
      if (c === '"') {
        i = readJsonStringEnd(text, i);
        continue;
      }
      if (c === "[") depth += 1;
      if (c === "]") {
        depth -= 1;
        if (depth === 0) {
          return { start: valueStart, end: i + 1 };
        }
      }
      i += 1;
    }
    throw new Error("unterminated JSON array");
  }
  return {
    start: valueStart,
    end: readJsonLiteralEnd(text, valueStart),
  };
}

function readJsonStringValue(text: string, start: number): string {
  const end = readJsonStringEnd(text, start);
  return JSON.parse(text.slice(start, end)) as string;
}

function findObjectPropertyValueStart(
  text: string,
  objectStart: number,
  key: string,
): number | null {
  if (text[objectStart] !== "{") return null;
  let i = skipWhitespace(text, objectStart + 1);
  while (i < text.length && text[i] !== "}") {
    if (text[i] !== '"') return null;
    const keyStart = i;
    const keyEnd = readJsonStringEnd(text, i);
    const parsedKey = readJsonStringValue(text, keyStart);
    i = skipWhitespace(text, keyEnd);
    if (text[i] !== ":") return null;
    const valueStart = skipWhitespace(text, i + 1);
    if (parsedKey === key) {
      return valueStart;
    }
    const bounds = jsonValueBounds(text, valueStart);
    i = skipWhitespace(text, bounds.end);
    if (text[i] === ",") {
      i += 1;
    }
    i = skipWhitespace(text, i);
  }
  return null;
}

function findArrayElementBounds(
  text: string,
  arrayStart: number,
  targetIndex: number,
): { start: number; end: number } | null {
  if (text[arrayStart] !== "[") return null;
  let i = skipWhitespace(text, arrayStart + 1);
  let current = 0;
  while (i < text.length && text[i] !== "]") {
    const bounds = jsonValueBounds(text, i);
    if (current === targetIndex) {
      return bounds;
    }
    current += 1;
    i = skipWhitespace(text, bounds.end);
    if (text[i] === ",") {
      i += 1;
    }
    i = skipWhitespace(text, i);
  }
  return null;
}

function offsetToLine(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === "\n") {
      line += 1;
    }
  }
  return line;
}

/** FNV-1a 64-bit hex — sync, stable across browser and Node. */
export function hashProgramStepContent(content: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < content.length; i += 1) {
    hash ^= BigInt(content.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Locates the exact wire JSON text span for a step in data.json.
 * `diskText` must be the current editor/saved wire JSON (not a summary slice).
 */
export function computeProgramStepDiskSlice(
  diskText: string,
  nodePath: string,
): ProgramStepDiskSliceResult {
  const tokens = parseNodePathTokens(nodePath);
  if (!tokens || tokens.length === 0) {
    return { ok: false, error: "invalid nodePath" };
  }

  try {
    const rootStart = skipWhitespace(diskText, 0);
    if (diskText[rootStart] !== "{") {
      return { ok: false, error: "data.json root is not an object" };
    }

    const stepsValueStart = findObjectPropertyValueStart(diskText, rootStart, "steps");
    if (stepsValueStart == null) {
      return { ok: false, error: 'data.json has no "steps" array' };
    }
    const stepsArrayStart = skipWhitespace(diskText, stepsValueStart);
    if (diskText[stepsArrayStart] !== "[") {
      return { ok: false, error: '"steps" is not a JSON array' };
    }

    let arrayStart = stepsArrayStart;
    let bounds: { start: number; end: number } | null = null;

    for (const token of tokens) {
      if (token.kind === "index") {
        bounds = findArrayElementBounds(diskText, arrayStart, token.index);
        if (!bounds) {
          return {
            ok: false,
            error: `step index ${token.index} out of range at nodePath ${nodePath}`,
          };
        }
        continue;
      }

      const objectStart = skipWhitespace(diskText, bounds!.start);
      if (diskText[objectStart] !== "{") {
        return { ok: false, error: "expected step object before branch token" };
      }
      const branchValueStart = findObjectPropertyValueStart(
        diskText,
        objectStart,
        token.branch,
      );
      if (branchValueStart == null) {
        return {
          ok: false,
          error: `step has no "${token.branch}" at nodePath ${nodePath}`,
        };
      }
      arrayStart = skipWhitespace(diskText, branchValueStart);
      if (diskText[arrayStart] !== "[") {
        return { ok: false, error: `"${token.branch}" is not a JSON array` };
      }
      bounds = findArrayElementBounds(diskText, arrayStart, token.index);
      if (!bounds) {
        return {
          ok: false,
          error: `branch index ${token.index} out of range at nodePath ${nodePath}`,
        };
      }
    }

    if (!bounds) {
      return { ok: false, error: "step not found" };
    }

    const content = diskText.slice(bounds.start, bounds.end);
    return {
      ok: true,
      slice: {
        nodePath,
        content,
        contentHash: hashProgramStepContent(content),
        startLine: offsetToLine(diskText, bounds.start),
        endLine: offsetToLine(diskText, Math.max(bounds.start, bounds.end - 1)),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}
