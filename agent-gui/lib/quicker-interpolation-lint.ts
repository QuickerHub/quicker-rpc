/** Detect `value` / `defaultValue` strings that use `{varName}` without a leading `$$` or `$=` prefix. */

const BRACE_VAR = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

const SKIP_INPUT_PARAM_KEYS = new Set(
  ["expression", "script", "code"].map((k) => k.toLowerCase()),
);

const SKIP_INPUT_PARAM_NEAR = /"(expression|script|code)"\s*:\s*\{/i;

/** Variable rows in data.json: `"key": "name", "type":` */
const VARIABLE_KEY_PAIR =
  /"key"\s*:\s*"([^"\\]+)"\s*,\s*"type"\s*:/g;

export type InterpolationLintHit = {
  from: number;
  to: number;
  variable: string;
  message: string;
};

export type ProgramValuePrefixWarning = {
  /** JSON path, e.g. steps[2].inputParams.message.value */
  location: string;
  dataJsonPath: string;
  preview: string;
  variables: string[];
  suggestedPrefix: "$$" | "$=";
  fixExample: string;
  /** 1-based lines in data.json (use for read_data slice; do not read from line 1). */
  startLine?: number;
  endLine?: number;
  /** Ready-made read_data invocation for this fix. */
  read?: string;
};

export const VALUE_PREFIX_AGENT_RULE =
  "If interpolation is intended and the string uses {varName} from variables[], it MUST start with $$ (interpolation) or $= (C#). "
  + "If the user wants literal braces (e.g. \"{a} {test}\"), leave as-is. "
  + "Use {\"varKey\":\"key\"} to bind a variable directly (no prefix). "
  + "SkipEval fields (expression/script/code) are exempt.";

function containsDefinedVariable(
  text: string,
  variableKeys: ReadonlySet<string>,
): string[] {
  const found: string[] = [];
  BRACE_VAR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BRACE_VAR.exec(text)) !== null) {
    const name = match[1] ?? "";
    if (variableKeys.has(name) && !found.includes(name)) {
      found.push(name);
    }
  }
  return found;
}

export function valueStringMissingEvalPrefix(value: string): boolean {
  const trimmed = value.trimStart();
  return !trimmed.startsWith("$$") && !trimmed.startsWith("$=");
}

export function suggestValuePrefix(value: string): "$$" | "$=" {
  const t = value.trim();
  if (
    /[=<>]|&&|\|\||string\.|\.Equals|\.Length|\.Count|\.Trim|var\s|new\s|return\s/.test(
      t,
    )
    || /\{[^}]+\}\s*[+\-*/]|[+\-*/]\s*\{/.test(t)
  ) {
    return "$=";
  }
  return "$$";
}

function buildFixExample(
  value: string,
  prefix: "$$" | "$=",
  variables: string[],
): string {
  const trimmed = value.trimStart();
  let body = trimmed;
  if (trimmed.startsWith("$$") || trimmed.startsWith("$=")) {
    body = trimmed.replace(/^\$\$?=?/, "");
  } else if (trimmed.startsWith("$")) {
    // Partial/wrong single-$ prefix from a bad edit_data replace
    body = trimmed.slice(1);
  }
  const sample = variables[0] ?? "varName";
  if (prefix === "$=") {
    return body.includes("{") ? `$=${body}` : `$={${sample}} + 1`;
  }
  return body.length > 0 ? `${prefix}${body}` : `${prefix}text {${sample}}`;
}

function charIndexToLine(text: string, index: number): number {
  if (index <= 0) return 1;
  return text.slice(0, index).split("\n").length;
}

function formatReadDataSliceHint(startLine: number, endLine: number): string {
  return `workspace_program({ action: "read_data", mode: "content", startLine: ${startLine}, endLine: ${endLine} })`;
}

function lineRangeForValueLiteral(
  jsonText: string,
  dataJsonPath: string,
  value: string,
): { startLine: number; endLine: number } | null {
  const quoted = JSON.stringify(value);
  const indices: number[] = [];
  let pos = 0;
  while (pos < jsonText.length) {
    const idx = jsonText.indexOf(quoted, pos);
    if (idx < 0) break;
    indices.push(idx);
    pos = idx + Math.max(quoted.length, 1);
  }

  let pick = indices[0];
  if (indices.length > 1) {
    const paramMatch = dataJsonPath.match(/inputParams\.([^.]+)\.value$/);
    if (paramMatch) {
      const anchor = `"${paramMatch[1]}"`;
      const narrowed = indices.filter((i) =>
        jsonText.slice(Math.max(0, i - 120), i).includes(anchor),
      );
      if (narrowed.length > 0) pick = narrowed[0];
    }
  }

  if (pick === undefined) {
    const idx = jsonText.indexOf(value);
    if (idx < 0) return null;
    pick = idx;
    const end = idx + value.length;
    return {
      startLine: Math.max(1, charIndexToLine(jsonText, pick) - 2),
      endLine: charIndexToLine(jsonText, end) + 2,
    };
  }

  const end = pick + quoted.length;
  return {
    startLine: Math.max(1, charIndexToLine(jsonText, pick) - 2),
    endLine: charIndexToLine(jsonText, end) + 2,
  };
}

function finalizeWarning(
  jsonText: string,
  location: string,
  value: string,
  variables: string[],
): ProgramValuePrefixWarning {
  const suggestedPrefix = suggestValuePrefix(value);
  const preview = value.length > 72 ? `${value.slice(0, 69)}…` : value;
  const dataJsonPath = location;
  const range = lineRangeForValueLiteral(jsonText, dataJsonPath, value);
  const startLine = range?.startLine;
  const endLine = range?.endLine;
  return {
    location,
    dataJsonPath,
    preview,
    variables,
    suggestedPrefix,
    fixExample: buildFixExample(value, suggestedPrefix, variables),
    startLine,
    endLine,
    read:
      startLine != null && endLine != null
        ? formatReadDataSliceHint(startLine, endLine)
        : undefined,
  };
}

function pushWarning(
  warnings: ProgramValuePrefixWarning[],
  jsonText: string,
  location: string,
  value: string,
  variables: string[],
): void {
  warnings.push(finalizeWarning(jsonText, location, value, variables));
}

function checkValueField(
  jsonText: string,
  value: unknown,
  location: string,
  variableKeys: ReadonlySet<string>,
  warnings: ProgramValuePrefixWarning[],
): void {
  if (
    value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && typeof (value as { file?: string }).file === "string"
  ) {
    return;
  }

  if (typeof value !== "string" || value.length === 0) {
    return;
  }
  if (!valueStringMissingEvalPrefix(value)) {
    return;
  }
  const variables = containsDefinedVariable(value, variableKeys);
  if (variables.length === 0) {
    return;
  }
  pushWarning(warnings, jsonText, location, value, variables);
}

function checkInputParamObject(
  jsonText: string,
  param: unknown,
  location: string,
  paramKey: string,
  variableKeys: ReadonlySet<string>,
  warnings: ProgramValuePrefixWarning[],
): void {
  if (!param || typeof param !== "object" || Array.isArray(param)) {
    return;
  }
  const row = param as Record<string, unknown>;
  if (typeof row.varKey === "string" || typeof row.file === "string") {
    return;
  }
  if (SKIP_INPUT_PARAM_KEYS.has(paramKey.toLowerCase())) {
    return;
  }
  checkValueField(jsonText, row.value, `${location}.value`, variableKeys, warnings);
}

function walkSteps(
  jsonText: string,
  steps: unknown,
  pathPrefix: string,
  variableKeys: ReadonlySet<string>,
  warnings: ProgramValuePrefixWarning[],
): void {
  if (!Array.isArray(steps)) {
    return;
  }
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || typeof step !== "object") {
      continue;
    }
    const row = step as Record<string, unknown>;
    const base = `${pathPrefix}[${i}]`;
    const inputParams = row.inputParams;
    if (inputParams && typeof inputParams === "object" && !Array.isArray(inputParams)) {
      for (const [paramKey, paramVal] of Object.entries(
        inputParams as Record<string, unknown>,
      )) {
        checkInputParamObject(
          jsonText,
          paramVal,
          `${base}.inputParams.${paramKey}`,
          paramKey,
          variableKeys,
          warnings,
        );
      }
    }
    walkSteps(jsonText, row.ifSteps, `${base}.ifSteps`, variableKeys, warnings);
    walkSteps(jsonText, row.elseSteps, `${base}.elseSteps`, variableKeys, warnings);
  }
}

export function scanProgramValuePrefixWarnings(
  jsonText: string,
  variableKeys?: ReadonlySet<string>,
): ProgramValuePrefixWarning[] {
  const keys = variableKeys ?? extractProgramVariableKeys(jsonText);
  if (keys.size === 0) {
    return [];
  }

  const warnings: ProgramValuePrefixWarning[] = [];
  try {
    const data = JSON.parse(jsonText) as {
      steps?: unknown;
      variables?: Array<{ key?: string; defaultValue?: unknown }>;
    };
    walkSteps(jsonText, data.steps, "steps", keys, warnings);
    for (const variable of data.variables ?? []) {
      const key = (variable.key ?? "").trim();
      if (!key) {
        continue;
      }
      checkValueField(
        jsonText,
        variable.defaultValue,
        `variables[key=${key}].defaultValue`,
        keys,
        warnings,
      );
    }
    return warnings;
  } catch {
    return scanProgramValuePrefixWarningsFromText(jsonText, keys);
  }
}

function scanProgramValuePrefixWarningsFromText(
  jsonText: string,
  variableKeys: ReadonlySet<string>,
): ProgramValuePrefixWarning[] {
  const hits = findInterpolationPrefixWarnings(jsonText, variableKeys);
  return hits.map((hit) => {
    const startLine = Math.max(1, charIndexToLine(jsonText, hit.from) - 2);
    const endLine = charIndexToLine(jsonText, hit.to) + 2;
    const prefix = suggestValuePrefix(jsonText.slice(hit.from - 40, hit.to + 40));
    const location = `data.json (char ${hit.from})`;
    return {
      location,
      dataJsonPath: location,
      preview: hit.message,
      variables: [hit.variable],
      suggestedPrefix: prefix,
      fixExample: buildFixExample("", prefix, [hit.variable]),
      startLine,
      endLine,
      read: formatReadDataSliceHint(startLine, endLine),
    };
  });
}

export function formatValuePrefixWarningsMessage(
  warnings: ProgramValuePrefixWarning[],
): string {
  if (warnings.length === 0) {
    return "";
  }
  const firstRead = warnings.find((w) => w.read)?.read;
  const lines = warnings.slice(0, 8).map((w) => {
    const lineHint =
      w.startLine != null && w.endLine != null
        ? ` data.json L${w.startLine}-${w.endLine}`
        : "";
    const readHint = w.read ? ` → ${w.read}` : "";
    return (
      `- ${w.location}${lineHint}: add "${w.suggestedPrefix}" at string start (uses {${w.variables.join(", ")}}). Example: "${w.fixExample}"${readHint}`
    );
  });
  const more =
    warnings.length > 8 ? `\n- …and ${warnings.length - 8} more` : "";
  const readLead = firstRead
    ? `Do NOT read data.json from line 1 or mode=summary first. Use each warning's read slice (e.g. ${firstRead}).\n`
    : "";
  return (
    `${warnings.length} value/defaultValue string(s) contain {variable} without $$ or $= at the start. `
    + "Warning only — cannot tell literal text from missing prefix; add prefix only when interpolation is intended.\n"
    + readLead
    + `${VALUE_PREFIX_AGENT_RULE}\n`
    + lines.join("\n")
    + more
  );
}

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
    const defaultMatch = before.match(/"defaultValue"\s*:\s*"([^"]*)$/);
    if (!defaultMatch) {
      return false;
    }
    const prefix = defaultMatch[1] ?? "";
    return valueStringMissingEvalPrefix(prefix);
  }

  const prefix = valueMatch[1] ?? "";
  if (!valueStringMissingEvalPrefix(prefix)) {
    return false;
  }

  const windowStart = Math.max(0, braceIndex - 120);
  const context = text.slice(windowStart, braceIndex);
  if (SKIP_INPUT_PARAM_NEAR.test(context)) {
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

    const suggested = suggestValuePrefix(text.slice(from - 20, from + 40));
    hits.push({
      from,
      to: from + match[0].length,
      variable,
      message:
        `字符串必须以 ${suggested} 开头才能展开 {${variable}}（当前为纯字面量）`,
    });
  }

  return hits;
}
