import { z } from "zod";

/** Minimal data.json body shape (steps + variables only). */
export const programDataSchema = z.object({
  steps: z
    .array(z.record(z.string(), z.unknown()))
    .default([])
    .describe("Program steps array"),
  variables: z
    .array(z.record(z.string(), z.unknown()))
    .default([])
    .describe("Program variables array"),
});

export type ProgramDataInput = z.infer<typeof programDataSchema>;

export function formatProgramDataJsonContent(
  data: ProgramDataInput,
  trailingNewline = true,
): string {
  return `${JSON.stringify(
    { steps: data.steps, variables: data.variables },
    null,
    2,
  )}${trailingNewline ? "\n" : ""}`;
}

export function programDataHasBody(data: ProgramDataInput): boolean {
  return data.steps.length > 0 || data.variables.length > 0;
}

export function normalizeProgramDataInput(data: unknown): ProgramDataInput | null {
  const parsed = programDataSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

const VAR_TYPE_ALIASES: Record<string, string | undefined> = {
  text: undefined,
  Text: undefined,
  string: undefined,
  number: "number",
  Number: "number",
  integer: "integer",
  Integer: "integer",
  boolean: "boolean",
  Boolean: "boolean",
};

function normalizeAgentVariableRecord(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  if (typeof raw.name === "string" && out.key == null) {
    out.key = raw.name;
    delete out.name;
  }
  if (typeof raw.type === "string" && out.varType == null) {
    const mapped = VAR_TYPE_ALIASES[raw.type];
    if (mapped) {
      out.varType = mapped;
    } else if (raw.type.toLowerCase() !== "text") {
      out.varType = raw.type.toLowerCase();
    }
    delete out.type;
  }
  if (raw.value !== undefined && out.default == null && out.defaultValue == null) {
    out.default = String(raw.value);
    delete out.value;
  }
  if (raw.defaultValue !== undefined && out.default == null) {
    out.default = String(raw.defaultValue);
    delete out.defaultValue;
  }
  return out;
}

function normalizeAgentStepRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  if (typeof raw.runnerKey === "string" && out.stepRunnerKey == null) {
    out.stepRunnerKey = raw.runnerKey;
    delete out.runnerKey;
  }
  if (raw.inputs != null && out.inputParams == null) {
    out.inputParams = raw.inputs;
    delete out.inputs;
  }
  if (raw.outputs != null && out.outputParams == null) {
    out.outputParams = raw.outputs;
    delete out.outputs;
  }
  return out;
}

function normalizeAgentProgramObject(
  obj: Record<string, unknown>,
): { body: ProgramDataInput; normalized: boolean } | null {
  let normalized = false;
  const rawVars = Array.isArray(obj.variables) ? obj.variables : [];
  const rawSteps = Array.isArray(obj.steps) ? obj.steps : [];
  const variables = rawVars.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return item;
    }
    const next = normalizeAgentVariableRecord(item as Record<string, unknown>);
    if (JSON.stringify(next) !== JSON.stringify(item)) {
      normalized = true;
    }
    return next;
  });
  const steps = rawSteps.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return item;
    }
    const next = normalizeAgentStepRecord(item as Record<string, unknown>);
    if (JSON.stringify(next) !== JSON.stringify(item)) {
      normalized = true;
    }
    return next;
  });
  const body = normalizeProgramDataInput({ steps, variables });
  if (!body) {
    return null;
  }
  return { body, normalized: normalized || rawVars !== obj.variables || rawSteps !== obj.steps };
}

/** Accept string or object program body; normalize common agent wire mistakes. */
export function coerceProgramDataContent(
  content: unknown,
):
  | { ok: true; text: string; normalized: boolean }
  | { ok: false; error: string } {
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (!trimmed) {
      return { ok: false, error: "content is required for write_data." };
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const normalized = normalizeAgentProgramObject(parsed as Record<string, unknown>);
        if (normalized) {
          return {
            ok: true,
            text: formatProgramDataJsonContent(normalized.body),
            normalized: normalized.normalized,
          };
        }
      }
    } catch {
      // Non-JSON string content is valid as-is.
    }
    return { ok: true, text: content, normalized: false };
  }
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const normalized = normalizeAgentProgramObject(content as Record<string, unknown>);
    if (!normalized) {
      return { ok: false, error: "Invalid program data shape." };
    }
    return {
      ok: true,
      text: formatProgramDataJsonContent(normalized.body),
      normalized: true,
    };
  }
  return { ok: false, error: "content must be a string or { steps, variables } object." };
}
