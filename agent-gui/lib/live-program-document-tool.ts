import { tool } from "ai";
import { z } from "zod";
import { describeLiveProgramDocumentOperations } from "./live-program-document-protocol";

const variableSelector = z.object({ surface: z.string().min(1), variableId: z.string().min(1) }).strict();
const readInput = z.object({ action: z.literal("read_live"), stepSchemaFor: z.string().min(1).optional(), variableFor: variableSelector.optional() }).strict();
const exclusiveRead = (value: { stepSchemaFor?: string; variableFor?: unknown }) => value.stepSchemaFor === undefined || value.variableFor === undefined;
function boundedVariableChanges(value: { action: string; changes?: unknown }): boolean {
  if (value.action !== "edit_variable_live") return true;
  const changes = value.changes as readonly { field: string; valueJson: string }[];
  if (new Set(changes.map(change => change.field)).size !== changes.length || new TextEncoder().encode(JSON.stringify(changes)).length > 1_048_576) return false;
  return changes.every(change => { try { const parsed: unknown = JSON.parse(change.valueJson); return typeof parsed !== "string" || parsed.length <= 100_000; } catch { return false; } });
}
const editInput = z.object({
  action: z.literal("edit_live"),
  readOperationId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  stepId: z.string().min(1),
  note: z.string(),
}).strict();
const editStepInputs = z.object({
  action: z.literal("edit_step_inputs_live"),
  readOperationId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  stepId: z.string().min(1),
  changes: z.array(z.object({ key: z.string().min(1).max(256), value: z.string().max(100_000) }).strict()).min(1).max(32),
}).strict();
const editVariable = z.object({ action: z.literal("edit_variable_live"), readOperationId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(), surface: z.string().min(1), variableId: z.string().min(1), contractRevision: z.string().min(1),
  changes: z.array(z.object({ field: z.string().min(1).max(256), valueJson: z.string().max(1_048_576) }).strict()).min(1).max(16),
}).strict();
export const liveProgramDocumentInputSchema = z.discriminatedUnion("action", [readInput, editInput, editStepInputs, editVariable])
  .refine(value => value.action !== "read_live" || exclusiveRead(value), "variableFor and stepSchemaFor are mutually exclusive")
  .refine(boundedVariableChanges, "Variable changes exceed the frozen value or payload budget");

/** Uses the existing SDK client-tool callback and addToolOutput continuation. */
export function createLiveProgramDocumentTool(mode: "read" | "edit", scopeId: string) {
  return tool({
    description: "Read the explicitly pinned live Designer document, including unsaved edits. "
      + describeLiveProgramDocumentOperations(mode),
    inputSchema: mode === "read" ? readInput.extend({ scopeId: z.literal(scopeId) }).refine(exclusiveRead)
      : z.discriminatedUnion("action", [readInput.extend({ scopeId: z.literal(scopeId) }), editInput.extend({ scopeId: z.literal(scopeId) }), editStepInputs.extend({ scopeId: z.literal(scopeId) }), editVariable.extend({ scopeId: z.literal(scopeId) })])
        .refine(value => value.action !== "read_live" || exclusiveRead(value)).refine(boundedVariableChanges),
  });
}

export function parseLiveProgramDocumentToolInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { scopeId, ...rest } = value as Record<string, unknown>;
  if (typeof scopeId !== "string" || !scopeId) return undefined;
  const parsed = liveProgramDocumentInputSchema.safeParse(rest);
  return parsed.success ? { scopeId, input: parsed.data } : undefined;
}
