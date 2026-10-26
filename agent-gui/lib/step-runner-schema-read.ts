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
