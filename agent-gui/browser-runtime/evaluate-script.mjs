/**
 * Builds the in-page code for browser `evaluate`, shared by the native Electron
 * runtime (webContents.executeJavaScript) and the Playwright runtime (page.evaluate).
 *
 * The user script is classified host-side (expression vs statement body) and embedded
 * directly into the page code — no in-page `new Function`/`eval`, so strict page CSP
 * cannot break evaluation. The result is converted to a JSON-safe value in-page
 * (DOM nodes summarized, circular refs cut) and page exceptions are captured with
 * their real message instead of an opaque rejection.
 */

const EVALUATE_RESULT_MARKER = "__qkEvaluate";

/**
 * In-page serializer turning arbitrary values into JSON-safe data.
 * Defined as a real function and embedded via toString() to avoid string-escaping bugs.
 */
function toSafeValue(value, depth, seen) {
  const MAX_DEPTH = 6;
  const MAX_ITEMS = 200;
  const MAX_STRING = 20000;
  if (value === undefined || value === null) return null;
  const type = typeof value;
  if (type === "string") {
    return value.length > MAX_STRING ? value.slice(0, MAX_STRING) : value;
  }
  if (type === "boolean") return value;
  if (type === "number") return Number.isFinite(value) ? value : String(value);
  if (type === "bigint") return value.toString();
  if (type === "function") {
    return "[function " + (value.name || "anonymous") + "]";
  }
  if (type === "symbol") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (typeof Node !== "undefined" && value instanceof Node) {
    if (value.nodeType === 1) {
      const el = value;
      const id = el.id ? "#" + el.id : "";
      const cls =
        typeof el.className === "string" && el.className.trim()
          ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
          : "";
      const text = (el.innerText || el.textContent || "").trim().slice(0, 160);
      return "<" + el.tagName.toLowerCase() + id + cls + ">" + (text ? " " + text : "");
    }
    return "[node " + value.nodeName + "]";
  }
  if (depth >= MAX_DEPTH) return "[max depth]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  const isArrayLike =
    Array.isArray(value)
    || (typeof NodeList !== "undefined" && value instanceof NodeList)
    || (typeof HTMLCollection !== "undefined" && value instanceof HTMLCollection);
  if (isArrayLike || value instanceof Set) {
    const items = Array.from(value);
    const out = items
      .slice(0, MAX_ITEMS)
      .map((item) => toSafeValue(item, depth + 1, seen));
    if (items.length > MAX_ITEMS) out.push("[+" + (items.length - MAX_ITEMS) + " more]");
    return out;
  }
  if (value instanceof Map) {
    const out = {};
    let count = 0;
    for (const [k, v] of value) {
      if (count >= MAX_ITEMS) {
        out["[truncated]"] = "[+" + (value.size - MAX_ITEMS) + " more]";
        break;
      }
      out[String(k)] = toSafeValue(v, depth + 1, seen);
      count += 1;
    }
    return out;
  }
  if (type === "object") {
    const out = {};
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      if (i >= MAX_ITEMS) {
        out["[truncated]"] = "[+" + (keys.length - MAX_ITEMS) + " more keys]";
        break;
      }
      try {
        out[keys[i]] = toSafeValue(value[keys[i]], depth + 1, seen);
      } catch {
        out[keys[i]] = "[unreadable]";
      }
    }
    return out;
  }
  return String(value);
}

function syntaxErrorMessage(build) {
  try {
    build();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** Host-side syntax check: does the source parse as an expression in async context? */
function expressionSyntaxError(source) {
  // eslint-disable-next-line no-new-func -- host-side syntax check only, never executed
  return syntaxErrorMessage(() => new Function(`return (async () => (\n${source}\n));`));
}

/** Host-side syntax check: does the source parse as an async function body? */
function statementsSyntaxError(source) {
  // eslint-disable-next-line no-new-func -- host-side syntax check only, never executed
  return syntaxErrorMessage(() => new Function(`return (async () => {\n${source}\n});`));
}

/**
 * @param {string} script user script
 * @returns {{ ok: true, code: string } | { ok: false, error: string }}
 */
export function buildEvaluatePageCode(script) {
  const trimmed = String(script ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: "script is required" };
  }

  // LLMs almost always end expressions with `;`, which breaks `(expr)` wrapping.
  const exprSource = trimmed.replace(/;+\s*$/, "");
  let runner;
  if (exprSource && expressionSyntaxError(exprSource) === null) {
    runner = `let __result = (\n${exprSource}\n);`;
  } else {
    const bodyError = statementsSyntaxError(trimmed);
    if (bodyError !== null) {
      return { ok: false, error: `script has a syntax error: ${bodyError}` };
    }
    runner = `let __result = await (async () => {\n${trimmed}\n})();`;
  }

  const code = `(async () => {
  ${toSafeValue.toString()}
  try {
    ${runner}
    if (typeof __result === "function") __result = __result();
    __result = await __result;
    return {
      ${EVALUATE_RESULT_MARKER}: true,
      ok: true,
      undefinedResult: __result === undefined,
      value: toSafeValue(__result, 0, new WeakSet()),
    };
  } catch (err) {
    const message = err instanceof Error
      ? (err.name && err.name !== "Error" ? err.name + ": " + err.message : err.message)
      : String(err);
    return { ${EVALUATE_RESULT_MARKER}: true, ok: false, error: message || "script threw" };
  }
})()`;
  return { ok: true, code };
}

/**
 * @param {unknown} raw value resolved from the page
 * @returns {{ ok: true, value: unknown, undefinedResult: boolean } | { ok: false, error: string }}
 */
export function parseEvaluateResult(raw) {
  if (
    typeof raw === "object"
    && raw !== null
    && /** @type {Record<string, unknown>} */ (raw)[EVALUATE_RESULT_MARKER] === true
  ) {
    const wrapped = /** @type {Record<string, unknown>} */ (raw);
    if (wrapped.ok === false) {
      return { ok: false, error: String(wrapped.error ?? "script threw") };
    }
    return {
      ok: true,
      value: wrapped.value ?? null,
      undefinedResult: wrapped.undefinedResult === true,
    };
  }
  // Defensive: page returned something outside the wrapper protocol.
  return { ok: true, value: raw ?? null, undefinedResult: raw === undefined };
}

export const EVALUATE_UNDEFINED_NOTE =
  "script returned undefined — end the script with an expression or use `return <value>`";

export const MAX_EVALUATE_VALUE_CHARS = 16_000;

function isStructuredValue(value) {
  return value !== null && typeof value === "object";
}

/** Objects/arrays stay structured; other scalars become strings for a single `value` field. */
function normalizeEvaluateValue(value) {
  if (value === null) return null;
  if (isStructuredValue(value)) return value;
  if (typeof value === "string") return value;
  return String(value);
}

function truncateStructuredValue(value, maxChars) {
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const candidate = [...out, item];
      if (JSON.stringify(candidate).length > maxChars) break;
      out.push(item);
    }
    if (out.length === 0 && value.length > 0) {
      const one = normalizeEvaluateValue(value[0]);
      if (typeof one === "string" && one.length > maxChars) {
        return [one.slice(0, maxChars)];
      }
      return [one];
    }
    return out;
  }

  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    const candidate = { ...out, [key]: entry };
    if (JSON.stringify(candidate).length > maxChars) break;
    out[key] = entry;
  }
  return out;
}

/**
 * @param {{ ok: true, value: unknown, undefinedResult: boolean }} parsed
 * @returns {{ value: unknown, truncated?: boolean, note?: string }}
 */
export function formatEvaluateOutput(parsed) {
  if (parsed.undefinedResult) {
    return { value: null, note: EVALUATE_UNDEFINED_NOTE };
  }

  let value = normalizeEvaluateValue(parsed.value ?? null);
  let truncated = false;
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_EVALUATE_VALUE_CHARS) {
    if (isStructuredValue(value)) {
      value = truncateStructuredValue(value, MAX_EVALUATE_VALUE_CHARS);
    } else if (typeof value === "string") {
      value = value.slice(0, MAX_EVALUATE_VALUE_CHARS);
    }
    truncated = true;
  }

  return {
    value,
    ...(truncated ? { truncated: true } : {}),
  };
}
