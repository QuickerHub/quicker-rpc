/** Connection-bound observations of the Agent projection; never editing permission. */
export const STEP_RUNNER_SCHEMA_READ_FORMAT = "qkrpc.agent-schema-read.v1";
export const STEP_RUNNER_SCHEMA_READ_PAYLOAD_MAX_CHARS = 6144;
export const STEP_RUNNER_SCHEMA_READ_DESCRIPTOR_MAX_CHARS = 2048;

export type StepRunnerSchemaReadRequest = {
  pointer?: string;
  mode?: "children" | "value";
  offset?: number;
  expectedObservation?: string;
};

export type StepRunnerSchemaReadInput = {
  key: string;
  controlField?: string;
  read: StepRunnerSchemaReadRequest;
};

export type StepRunnerSchemaReadChild = {
  pointer: string;
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  jsonChars: number;
  childCount?: number;
};

export type StepRunnerSchemaRead = {
  format: typeof STEP_RUNNER_SCHEMA_READ_FORMAT;
  status: "available" | "unavailable" | "start";
  observation?: string;
  pointer: string;
  mode: "children" | "value";
  offset: number;
  offsetUnit: "children" | "utf16";
  total: number | null;
  nextOffset: number | null;
  selectedComplete: boolean;
  /** Complete Agent schema body only; excludes attached knowledge and is not full native UI schema. */
  agentSchemaComplete: boolean;
  content?: string;
  children?: StepRunnerSchemaReadChild[];
  error?: { code: string; message: string };
  /** Omitted only when the descriptor cannot fit without altering the input. */
  input?: StepRunnerSchemaReadInput;
  nextRead?: StepRunnerSchemaReadInput;
};

/** The full payload, including metadata, must fit PAYLOAD_MAX_CHARS before model projection. */
export type StepRunnerSchemaReadPayload = {
  success: boolean;
  schemaRead: StepRunnerSchemaRead;
  knowledgeStatus: "preserved" | "unknown" | "omitted";
  knowledge?: Record<string, unknown>;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function chars(value: unknown): number {
  try { return JSON.stringify(value).length; } catch { return Infinity; }
}

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const pointer = (value: unknown): value is string => typeof value === "string" && (value === "" || /^\/(?:[^~]|~[01])*$/.test(value));

/** Copy only callable get arguments; identities and explicit empty control values stay exact. */
function readInput(value: unknown): StepRunnerSchemaReadInput | undefined {
  const input = record(value), read = record(input?.read);
  if (!input || typeof input.key !== "string" || !input.key.trim() || !read
    || (input.controlField !== undefined && typeof input.controlField !== "string")
    || !pointer(read.pointer) || !["children", "value"].includes(String(read.mode)) || !integer(read.offset)
    || (read.expectedObservation !== undefined && (typeof read.expectedObservation !== "string" || !read.expectedObservation))) return;
  return {
    key: input.key,
    ...(input.controlField !== undefined ? { controlField: input.controlField as string } : {}),
    read: { pointer: read.pointer, mode: read.mode as "children" | "value", offset: read.offset,
      ...(read.expectedObservation !== undefined ? { expectedObservation: read.expectedObservation as string } : {}) },
  };
}

export function unavailableStepRunnerSchemaRead(code: string, message: string): StepRunnerSchemaRead {
  return { format: STEP_RUNNER_SCHEMA_READ_FORMAT, status: "unavailable", pointer: "", mode: "children", offset: 0,
    offsetUnit: "children", total: null, nextOffset: null, selectedComplete: false, agentSchemaComplete: false, error: { code, message } };
}

/** A start is a request suggestion, not evidence that the connected server supports paging. */
export function startStepRunnerSchemaRead(value: unknown): StepRunnerSchemaRead {
  const source = record(value);
  const key = source?.key ?? source?.runnerKey;
  const input = readInput({ key, ...(source?.controlField !== undefined ? { controlField: source.controlField } : {}),
    read: { pointer: "", mode: "children", offset: 0 } });
  if (!input) return unavailableStepRunnerSchemaRead("schema_read_input_unavailable", "The exact get input is unavailable; fetch the current module before requesting a selection.");
  const result: StepRunnerSchemaRead = { format: STEP_RUNNER_SCHEMA_READ_FORMAT, status: "start", pointer: "", mode: "children", offset: 0,
    offsetUnit: "children", total: null, nextOffset: null, selectedComplete: false, agentSchemaComplete: false, input };
  return chars(result) <= STEP_RUNNER_SCHEMA_READ_DESCRIPTOR_MAX_CHARS ? result
    : unavailableStepRunnerSchemaRead("schema_read_descriptor_too_large", "The exact continuation input exceeds the budget; no identity was shortened.");
}

/** Validate the whole page before projection; never repair an inconsistent cursor or identity. */
export function readStepRunnerSchemaRead(value: unknown): StepRunnerSchemaRead {
  const source = record(value);
  const invalid = () => unavailableStepRunnerSchemaRead("schema_read_invalid", "The schema read receipt is incomplete or inconsistent; no page continuation is available.");
  if (!source || source.format !== STEP_RUNNER_SCHEMA_READ_FORMAT) {
    return unavailableStepRunnerSchemaRead("schema_read_unsupported", "This schema read format is unsupported; its body and continuation were not accepted.");
  }
  if (chars(source) > STEP_RUNNER_SCHEMA_READ_PAYLOAD_MAX_CHARS) {
    return unavailableStepRunnerSchemaRead("schema_read_page_too_large", "The schema read page exceeds the model budget; no partial page was presented as complete.");
  }
  const { content: _content, children: _children, ...descriptor } = source;
  if (chars(descriptor) > STEP_RUNNER_SCHEMA_READ_DESCRIPTOR_MAX_CHARS) {
    return unavailableStepRunnerSchemaRead("schema_read_descriptor_too_large", "The exact continuation descriptor exceeds the budget; no identity was shortened.");
  }
  if (!["available", "unavailable", "start"].includes(String(source.status)) || !pointer(source.pointer)
    || !["children", "value"].includes(String(source.mode)) || !integer(source.offset)
    || source.offsetUnit !== (source.mode === "children" ? "children" : "utf16")
    || !(source.total === null || integer(source.total)) || !(source.nextOffset === null || integer(source.nextOffset))
    || typeof source.selectedComplete !== "boolean" || typeof source.agentSchemaComplete !== "boolean"
    || (source.observation !== undefined && (typeof source.observation !== "string" || !source.observation))) return invalid();
  const input = source.input === undefined ? undefined : readInput(source.input);
  const nextRead = source.nextRead === undefined ? undefined : readInput(source.nextRead);
  if ((source.input !== undefined && !input) || (source.nextRead !== undefined && !nextRead)) return invalid();
  const error = record(source.error);
  if (source.error !== undefined && (!error || typeof error.code !== "string" || typeof error.message !== "string")) return invalid();
  const result: StepRunnerSchemaRead = {
    format: STEP_RUNNER_SCHEMA_READ_FORMAT, status: source.status as StepRunnerSchemaRead["status"],
    pointer: source.pointer, mode: source.mode as StepRunnerSchemaRead["mode"], offset: source.offset,
    offsetUnit: source.offsetUnit as StepRunnerSchemaRead["offsetUnit"], total: source.total as number | null,
    nextOffset: source.nextOffset as number | null, selectedComplete: source.selectedComplete, agentSchemaComplete: source.agentSchemaComplete,
    ...(source.observation !== undefined ? { observation: source.observation as string } : {}),
    ...(input ? { input } : {}), ...(nextRead ? { nextRead } : {}),
    ...(error ? { error: { code: error.code as string, message: error.message as string } } : {}),
  };
  if (result.status !== "available") {
    if (source.content !== undefined || source.children !== undefined || result.selectedComplete || result.agentSchemaComplete || nextRead || result.nextOffset !== null) return invalid();
    if (result.status === "start" && (!input || result.observation !== undefined || result.pointer !== "" || result.mode !== "children"
      || result.offset !== 0 || result.total !== null || result.nextOffset !== null || input.read.expectedObservation !== undefined
      || input.read.pointer !== "" || input.read.mode !== "children" || input.read.offset !== 0)) return invalid();
    return result;
  }
  if (!input || result.total === null || result.offset > result.total || error
    || input.read.pointer !== result.pointer || input.read.mode !== result.mode || input.read.offset !== result.offset
    || input.read.expectedObservation !== result.observation) return invalid();
  let returned: number;
  if (result.mode === "value") {
    if (typeof source.content !== "string" || source.children !== undefined) return invalid();
    result.content = source.content;
    returned = source.content.length;
  } else {
    if (!Array.isArray(source.children) || source.content !== undefined) return invalid();
    const children: StepRunnerSchemaReadChild[] = [];
    const seen = new Set<string>();
    for (const value of source.children) {
      const child = record(value);
      if (!child || !pointer(child.pointer) || !["object", "array", "string", "number", "boolean", "null"].includes(String(child.type))
        || !integer(child.jsonChars) || (child.childCount !== undefined && !integer(child.childCount))) return invalid();
      const suffix = child.pointer.slice(result.pointer.length + 1);
      if (!child.pointer.startsWith(`${result.pointer}/`) || suffix.includes("/") || seen.has(child.pointer)) return invalid();
      seen.add(child.pointer);
      children.push({ pointer: child.pointer, type: child.type as StepRunnerSchemaReadChild["type"], jsonChars: child.jsonChars,
        ...(child.childCount !== undefined ? { childCount: child.childCount as number } : {}) });
    }
    result.children = children;
    returned = children.length;
  }
  const end = result.offset + returned;
  const complete = result.offset === 0 && end === result.total;
  if (end > result.total || result.selectedComplete !== complete
    || result.agentSchemaComplete !== (result.mode === "value" && result.pointer === "" && complete)
    || result.nextOffset !== (end < result.total ? end : null)
    || (end < result.total && returned === 0)) return invalid();
  if (result.nextOffset === null ? nextRead !== undefined : !nextRead) return invalid();
  if (!result.observation && (nextRead || result.offset !== 0 || !result.selectedComplete)) {
    return unavailableStepRunnerSchemaRead("schema_read_owner_unknown", "The owner observation is unknown; only a complete first page can be read without joining observations.");
  }
  if (nextRead && (nextRead.key !== input.key || nextRead.controlField !== input.controlField
    || Object.hasOwn(nextRead, "controlField") !== Object.hasOwn(input, "controlField")
    || nextRead.read.pointer !== result.pointer || nextRead.read.mode !== result.mode
    || nextRead.read.offset !== result.nextOffset || nextRead.read.expectedObservation !== result.observation)) return invalid();
  return result;
}

/** A historical descriptor can replay its old selection, but no longer claims to contain that page. */
export function compactStepRunnerSchemaRead(value: StepRunnerSchemaRead): StepRunnerSchemaRead {
  if (value.status !== "available") return value;
  const { content: _content, children: _children, nextRead: _nextRead, ...receipt } = value;
  const result: StepRunnerSchemaRead = { ...receipt, status: "unavailable", selectedComplete: false, agentSchemaComplete: false,
    nextOffset: null, error: { code: "schema_read_body_compacted", message: "Historical page body omitted. Replay input to read this selection again; the host observation must still match." } };
  return chars(result) <= STEP_RUNNER_SCHEMA_READ_DESCRIPTOR_MAX_CHARS ? result
    : unavailableStepRunnerSchemaRead("schema_read_descriptor_too_large", "The historical replay descriptor exceeds the budget; no identity was shortened.");
}
