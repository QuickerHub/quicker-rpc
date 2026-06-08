import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** @type {Map<string, object>} */
const cache = new Map();

/**
 * @param {string} stepRunnerKey
 * @param {string | undefined} controlField
 */
function cacheKey(stepRunnerKey, controlField) {
  return `${stepRunnerKey}\0${controlField ?? ""}`;
}

/**
 * @param {string} stdout
 */
function parseQkrpcJson(stdout) {
  const trimmed = stdout.replace(/^\uFEFF/, "").trim();
  const envelope = JSON.parse(trimmed);
  const schema = envelope?.payload?.schema ?? envelope?.schema;
  if (!schema) {
    throw new Error("step-runner get: missing schema in response");
  }
  return schema;
}

/**
 * @param {string} stepRunnerKey
 * @param {string | undefined} controlField
 */
export async function fetchStepRunnerSchema(stepRunnerKey, controlField) {
  const key = cacheKey(stepRunnerKey, controlField);
  if (cache.has(key)) return cache.get(key);

  const args = ["step-runner", "get", "--key", stepRunnerKey, "--json"];
  if (controlField) {
    args.push("--control-field", controlField);
  }

  const { stdout } = await execFileAsync("qkrpc", args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const schema = parseQkrpcJson(stdout);
  cache.set(key, schema);
  return schema;
}

/**
 * Resolve control-field value from compressed wire inputParams, then fetch filtered schema.
 *
 * @param {string} stepRunnerKey
 * @param {Record<string, string>} inputParams
 */
export async function fetchSchemaForStep(stepRunnerKey, inputParams) {
  const base = await fetchStepRunnerSchema(stepRunnerKey);
  const cfKey = base?.controlField?.key;
  if (!cfKey) return base;

  const literal = inputParams[cfKey];
  if (literal && !literal.includes("$")) {
    return fetchStepRunnerSchema(stepRunnerKey, literal);
  }
  return base;
}
