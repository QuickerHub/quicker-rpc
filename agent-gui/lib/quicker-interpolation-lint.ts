/** Detect literal values that use `{varKey}` without a leading `$$` prefix (Quicker interpolation). */

const BRACE_VAR = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

const SKIP_PARAM_NEAR = /"(expression|script|code)"\s*:\s*\{/i;

/** Variable rows in data.json: `"key": "name", "type":` */
const VARIABLE_KEY_PAIR =
  /"key"\s*:\s*"([^"\\]+)"\s*,\s*"type"\s*:/g;

export type InterpolationLintHit = {
  from: number;
  to: number;
  variable: string;
  message: string;
};

export function extractProgramVariableKeys(jsonText: string): Set<string> {
  const keys = new Set<string>();
  try {
    const parsed = JSON.parse(jsonText) as {
      variables?: Array<{ key?: string; Key?: string }>;
    };
    for (const row of parsed.variables ?? []) {
      const key = (row.key ?? row.Key ?? "").trim();
      if (key) keys.add(key);
    }
    if (keys.size > 0) {
      return keys;
    }
  } catch {
    /* partial diff / invalid JSON */
  }

  for (const match of jsonText.matchAll(VARIABLE_KEY_PAIR)) {
    const key = match[1]?.trim();
    if (key) keys.add(key);
  }

  return keys;
}

function valueLiteralNeedsInterpolationPrefix(
  text: string,
  braceIndex: number,
): boolean {
  const before = text.slice(0, braceIndex);
  const valueMatch = before.match(/"value"\s*:\s*"([^"]*)$/);
  if (!valueMatch) {
    return false;
  }

  const prefix = valueMatch[1] ?? "";
  if (prefix.includes("$$")) {
    return false;
  }

  const windowStart = Math.max(0, braceIndex - 120);
  const context = text.slice(windowStart, braceIndex);
  if (SKIP_PARAM_NEAR.test(context)) {
    return false;
  }

  return true;
}

export function findInterpolationPrefixWarnings(
  text: string,
  variableKeys: ReadonlySet<string>,
): InterpolationLintHit[] {
  if (variableKeys.size === 0 || !text.includes("{")) {
    return [];
  }

  const hits: InterpolationLintHit[] = [];
  BRACE_VAR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BRACE_VAR.exec(text)) !== null) {
    const variable = match[1] ?? "";
    if (!variableKeys.has(variable)) {
      continue;
    }

    const from = match.index;
    if (!valueLiteralNeedsInterpolationPrefix(text, from)) {
      continue;
    }

    hits.push({
      from,
      to: from + match[0].length,
      variable,
      message:
        `应用 $$ 前缀才能插值；字面量中的 {${variable}} 不会展开（例如 $$…{${variable}}…）`,
    });
  }

  return hits;
}
