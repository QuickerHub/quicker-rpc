/** @typedef {{ key: string; default?: string | boolean | number; valueType?: string; isControlField?: boolean }} SchemaInput */

const BOOL_ALIASES = new Map([
  ["0", "false"],
  ["1", "true"],
  ["false", "false"],
  ["true", "true"],
]);

/**
 * @param {unknown} value
 */
function wireValueToLiteralString(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value !== null && typeof value === "object")
    return JSON.stringify(value);
  return String(value ?? "").trim();
}

/**
 * @param {unknown} value
 */
function isLiteralWireValue(value) {
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    Array.isArray(value) ||
    (value !== null && typeof value === "object")
  ) {
    return true;
  }
  return !String(value).includes("$");
}

/**
 * @param {string | undefined} a
 * @param {string | undefined} b
 */
export function valuesEqualDefault(a, b) {
  const left = (a ?? "").trim();
  const right = (b ?? "").trim();
  if (left === right) return true;

  const na = BOOL_ALIASES.get(left.toLowerCase()) ?? left;
  const nb = BOOL_ALIASES.get(right.toLowerCase()) ?? right;
  return na === nb;
}

/**
 * @param {string | boolean | number | undefined} def
 */
function defaultToWireLiteral(def) {
  if (def === true) return "true";
  if (def === false) return "false";
  if (typeof def === "number") return String(def);
  return (def ?? "").trim();
}

/**
 * @param {SchemaInput[]} inputs
 */
function buildDefaultIndex(inputs) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const row of inputs ?? []) {
    if (!row?.key || row.default === undefined) continue;
    const literal = defaultToWireLiteral(row.default);
    if (literal !== "") {
      map.set(row.key, literal);
    }
  }
  return map;
}

/**
 * @param {string} wireKey
 */
function splitWireKey(wireKey) {
  if (wireKey.endsWith(".var")) {
    return { base: wireKey.slice(0, -4), suffix: ".var" };
  }
  if (wireKey.endsWith(".file")) {
    return { base: wireKey.slice(0, -5), suffix: ".file" };
  }
  return { base: wireKey, suffix: "" };
}

/**
 * Drop inputParams whose literal value equals step-runner schema default.
 * Wire values may be JSON bool/number or strings (`$$` / `$=` expressions must be strings).
 *
 * @param {Record<string, unknown> | undefined} inputParams
 * @param {{ inputs?: SchemaInput[] } | undefined} schema
 */
export function omitDefaultInputParams(inputParams, schema) {
  if (!inputParams || !schema?.inputs?.length) {
    return inputParams ?? {};
  }

  const defaults = buildDefaultIndex(schema.inputs);
  /** @type {Record<string, unknown>} */
  const out = {};

  for (const [wireKey, rawValue] of Object.entries(inputParams)) {
    const { base, suffix } = splitWireKey(wireKey);

    if (suffix === ".var" || suffix === ".file") {
      out[wireKey] = rawValue;
      continue;
    }

    if (!isLiteralWireValue(rawValue)) {
      out[wireKey] = rawValue;
      continue;
    }

    const literal = wireValueToLiteralString(rawValue);
    if (literal === "") {
      continue;
    }

    const def = defaults.get(base);
    if (def !== undefined && valuesEqualDefault(literal, def)) {
      continue;
    }

    out[wireKey] = rawValue;
  }

  return out;
}

/**
 * @param {Record<string, unknown>} step
 * @param {{ inputs?: SchemaInput[] } | undefined} schema
 */
export function omitDefaultsOnStep(step, schema) {
  const inputParams = /** @type {Record<string, unknown> | undefined} */ (
    step.inputParams
  );
  const next = omitDefaultInputParams(inputParams, schema);
  return {
    ...step,
    ...(Object.keys(next).length ? { inputParams: next } : {}),
  };
}
