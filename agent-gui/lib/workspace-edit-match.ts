import {
  countSubstringOccurrences,
  lineNumbersForMatches,
} from "@/lib/workspace-file-helpers";

export function normalizeEditEol(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Literal substring replace. Avoid String.replace/replaceAll — `$` in the
 * replacement is special (`$$` → one `$`), which breaks Quicker `$$` prefixes.
 */
export function replaceLiteralSubstring(
  haystack: string,
  needle: string,
  replacement: string,
  replaceAll = false,
): string {
  if (!needle) return haystack;
  if (!replaceAll) {
    const idx = haystack.indexOf(needle);
    if (idx < 0) return haystack;
    return (
      haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length)
    );
  }
  return haystack.split(needle).join(replacement);
}

/** Keep LF edits but write back with CRLF when the file on disk used CRLF. */
export function restoreFileEol(text: string, originalContent: string): string {
  if (!originalContent.includes("\r\n")) return text;
  return normalizeEditEol(text).replace(/\n/g, "\r\n");
}

function unescapeAgentLiteralEscapes(text: string): string {
  return text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/** Variants when the model pasted JSON-escaped text or wrapped strings. */
export function expandOldStringTextVariants(oldString: string): string[] {
  const collected: string[] = [];
  const push = (s: string) => {
    if (s.length > 0 && !collected.includes(s)) collected.push(s);
  };

  push(oldString);
  const trimmed = oldString.trim();
  if (trimmed !== oldString) push(trimmed);

  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    try {
      const inner = JSON.parse(trimmed) as unknown;
      if (typeof inner === "string") push(inner);
    } catch {
      /* not a JSON string literal */
    }
  }

  if (!oldString.includes("\n") && /\\(?:n|r|t|"|\\)/.test(oldString)) {
    push(unescapeAgentLiteralEscapes(oldString));
    push(unescapeAgentLiteralEscapes(trimmed));
  }

  return collected;
}

function buildJsonTextVariants(value: unknown, content: string): string[] {
  const indent = detectJsonIndent(content);
  const normContent = normalizeEditEol(content);
  const trailingNl = normContent.endsWith("\n");
  const bases = [
    JSON.stringify(value),
    JSON.stringify(value, null, 2),
  ];
  if (indent !== 2) {
    bases.push(JSON.stringify(value, null, indent));
  }
  const formatted: string[] = [];
  for (const base of bases) {
    formatted.push(base);
    if (trailingNl) formatted.push(`${base}\n`);
  }
  return [...new Set(formatted)];
}

function fileUsesCrlf(content: string): boolean {
  return content.includes("\r\n");
}

function toFileEol(text: string, content: string): string {
  if (!fileUsesCrlf(content)) return text;
  return normalizeEditEol(text).replace(/\n/g, "\r\n");
}

export function buildOldStringNeedleCandidates(
  content: string,
  oldString: string,
): { needle: string; haystack: string }[] {
  const hayNorm = normalizeEditEol(content);
  const candidates: { needle: string; haystack: string }[] = [];
  const seen = new Set<string>();

  const add = (needle: string, haystack: string) => {
    const key = `${needle}\0${haystack === content ? "raw" : "norm"}`;
    if (!needle || seen.has(key)) return;
    seen.add(key);
    candidates.push({ needle, haystack });
  };

  for (const oldVar of expandOldStringTextVariants(oldString)) {
    add(oldVar, content);
    const normOld = normalizeEditEol(oldVar);
    add(normOld, hayNorm);
    const trimmed = normOld.trim();
    if (trimmed !== normOld) add(trimmed, hayNorm);
    add(toFileEol(normOld, content), content);
    if (trimmed !== normOld) add(toFileEol(trimmed, content), content);

    const parsed = tryParseJson(normOld);
    if (parsed !== undefined) {
      for (const formatted of buildJsonTextVariants(parsed, content)) {
        add(formatted, content);
        add(normalizeEditEol(formatted), hayNorm);
        add(toFileEol(formatted, content), content);
      }
    }
  }

  return candidates;
}

function tryParseJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of keys) {
      if (!deepEqual(ao[k], bo[k])) return false;
    }
    return true;
  }
  return false;
}

export function detectJsonIndent(content: string): number {
  const m = content.match(/\n( +|\t)["\w]/);
  if (!m?.[1]) return 2;
  if (m[1].includes("\t")) return 1;
  return m[1].length || 2;
}

function stringifyJsonPreservingIndent(doc: unknown, content: string): string {
  const indent = detectJsonIndent(content);
  return `${JSON.stringify(doc, null, indent)}\n`;
}

export function isEmptyProgramTemplate(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  const steps = o.steps;
  const variables = o.variables;
  return (
    Array.isArray(steps)
    && steps.length === 0
    && Array.isArray(variables)
    && variables.length === 0
    && Object.keys(o).every((k) => k === "steps" || k === "variables")
  );
}

function programCounts(value: unknown): { steps: number; variables: number } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const o = value as Record<string, unknown>;
  return {
    steps: Array.isArray(o.steps) ? o.steps.length : 0,
    variables: Array.isArray(o.variables) ? o.variables.length : 0,
  };
}

function partialObjectReplace(
  doc: Record<string, unknown>,
  oldPartial: Record<string, unknown>,
  newPartial: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(oldPartial)) {
    if (!(key in doc)) return false;
    if (!deepEqual(doc[key], oldPartial[key])) return false;
  }
  for (const key of Object.keys(newPartial)) {
    doc[key] = newPartial[key];
  }
  return true;
}

function mergeVariablesByKey(
  existing: unknown[],
  incoming: unknown[],
): unknown[] {
  const merged = [...existing];
  const keys = new Set(
    existing
      .filter((v) => v && typeof v === "object")
      .map((v) => String((v as { key?: unknown }).key ?? "")),
  );
  for (const item of incoming) {
    if (!item || typeof item !== "object") continue;
    const key = String((item as { key?: unknown }).key ?? "");
    if (!key || keys.has(key)) continue;
    keys.add(key);
    merged.push(item);
  }
  return merged;
}

export type JsonDocumentEditResult =
  | { ok: true; next: string; strategy: string }
  | {
      ok: false;
      reason: "stale-empty-template";
      hint: string;
      steps: number;
      variables: number;
    };

function tryJsonDocumentEditOnce(
  content: string,
  oldString: string,
  newString: string,
): JsonDocumentEditResult | null {
  const doc = tryParseJson(content);
  const oldVal = tryParseJson(oldString);
  const newVal = tryParseJson(newString);
  if (doc === undefined || oldVal === undefined || newVal === undefined) {
    return null;
  }

  if (isEmptyProgramTemplate(oldVal)) {
    const counts = programCounts(doc);
    if (counts && (counts.steps > 0 || counts.variables > 0)) {
      return {
        ok: false,
        reason: "stale-empty-template",
        hint:
          "data.json already has content (see steps/variables counts). "
          + "oldString looks like an empty template from an earlier read — use "
          + "workspace_program read_data mode=content (or startLine slice) and "
          + "edit a fragment that exists on disk now.",
        steps: counts.steps,
        variables: counts.variables,
      };
    }
  }

  if (deepEqual(doc, oldVal)) {
    return {
      ok: true,
      next: stringifyJsonPreservingIndent(newVal, content),
      strategy: "json-full-replace",
    };
  }

  if (
    typeof doc === "object"
    && doc !== null
    && !Array.isArray(doc)
    && typeof oldVal === "object"
    && oldVal !== null
    && !Array.isArray(oldVal)
    && typeof newVal === "object"
    && newVal !== null
    && !Array.isArray(newVal)
  ) {
    const docObj = { ...(doc as Record<string, unknown>) };
    const oldObj = oldVal as Record<string, unknown>;
    const newObj = newVal as Record<string, unknown>;

    if (partialObjectReplace(docObj, oldObj, newObj)) {
      return {
        ok: true,
        next: stringifyJsonPreservingIndent(docObj, content),
        strategy: "json-partial-keys",
      };
    }

    const oldKeys = Object.keys(oldObj);
    if (oldKeys.length === 1 && oldKeys[0] === "steps") {
      const oldSteps = oldObj.steps;
      const newSteps = newObj.steps;
      if (
        Array.isArray(oldSteps)
        && oldSteps.length === 0
        && Array.isArray(newSteps)
        && newSteps.length > 0
        && Array.isArray(docObj.steps)
      ) {
        docObj.steps = [...docObj.steps, ...newSteps];
        return {
          ok: true,
          next: stringifyJsonPreservingIndent(docObj, content),
          strategy: "json-append-steps",
        };
      }
    }

    if (oldKeys.length === 1 && oldKeys[0] === "variables") {
      const oldVars = oldObj.variables;
      const newVars = newObj.variables;
      if (
        Array.isArray(oldVars)
        && oldVars.length === 0
        && Array.isArray(newVars)
        && newVars.length > 0
        && Array.isArray(docObj.variables)
      ) {
        if (docObj.variables.length === 0) {
          docObj.variables = newVars;
        } else {
          docObj.variables = mergeVariablesByKey(docObj.variables, newVars);
        }
        return {
          ok: true,
          next: stringifyJsonPreservingIndent(docObj, content),
          strategy: "json-merge-variables",
        };
      }
    }
  }

  return null;
}

/** JSON-aware edit when exact oldString is missing (data.json / *.json). */
export function tryJsonDocumentEdit(
  content: string,
  oldString: string,
  newString: string,
): JsonDocumentEditResult | null {
  const newVariants = expandOldStringTextVariants(newString);
  for (const oldVar of expandOldStringTextVariants(oldString)) {
    for (const newVar of newVariants) {
      const result = tryJsonDocumentEditOnce(content, oldVar, newVar);
      if (result) return result;
    }
  }
  return null;
}

export type ResolvedEditNeedle =
  | {
      kind: "unique";
      needle: string;
      haystack: string;
      /** True when match used LF normalization or CRLF needle variant. */
      eolNormalized?: boolean;
    }
  | { kind: "ambiguous"; matchCount: number; matchLines: number[]; needle: string }
  | { kind: "missing" };

export function resolveUniqueEditNeedle(
  content: string,
  oldString: string,
): ResolvedEditNeedle {
  let firstAmbiguous: ResolvedEditNeedle | null = null;

  for (const { needle, haystack } of buildOldStringNeedleCandidates(
    content,
    oldString,
  )) {
    const count = countSubstringOccurrences(haystack, needle);
    if (count === 1) {
      return {
        kind: "unique",
        needle,
        haystack,
        eolNormalized: haystack !== content || needle !== oldString,
      };
    }
    if (count > 1 && !firstAmbiguous) {
      firstAmbiguous = {
        kind: "ambiguous",
        matchCount: count,
        matchLines: lineNumbersForMatches(haystack, needle, 5),
        needle,
      };
    }
  }

  return firstAmbiguous ?? { kind: "missing" };
}

export function buildEditNotFoundMessage(
  relativePath: string,
  content: string,
  oldString: string,
  extra?: { hint?: string; steps?: number; variables?: number },
): string {
  const lines: string[] = [
    `oldString not found in ${relativePath}. Read a slice with file_read / read_data (startLine) before editing.`,
  ];
  if (extra?.steps != null || extra?.variables != null) {
    lines.push(
      `Current file: steps=${extra.steps ?? "?"}, variables=${extra.variables ?? "?"}.`,
    );
  }
  if (extra?.hint) lines.push(extra.hint);

  const fileCrlf = fileUsesCrlf(content);
  const oldCrlf = oldString.includes("\r\n");
  const oldHasRealNl = oldString.includes("\n");
  const oldHasLiteralNl = !oldHasRealNl && /\\n/.test(oldString);
  if (fileCrlf && !oldCrlf) {
    lines.push(
      "Line endings: file uses CRLF; oldString uses LF only (matching tries both).",
    );
  }
  if (oldHasLiteralNl) {
    lines.push(
      "oldString contains literal \\n escapes — use real newlines from read_data, not JSON-quoted text.",
    );
  }

  const preview = normalizeEditEol(content).slice(0, 280).trim();
  if (preview) {
    lines.push(`File head: ${preview}${content.length > 280 ? "…" : ""}`);
  }

  const oldPreview = normalizeEditEol(oldString).slice(0, 120).trim();
  if (oldPreview) {
    lines.push(`oldString (first 120 chars): ${oldPreview}${oldString.length > 120 ? "…" : ""}`);
  }

  return lines.join(" ");
}

export function isJsonEditPath(relativePath: string): boolean {
  return relativePath.replace(/\\/g, "/").toLowerCase().endsWith(".json");
}

export function isDataJsonPath(relativePath: string): boolean {
  return relativePath.replace(/\\/g, "/").toLowerCase().endsWith("/data.json");
}
