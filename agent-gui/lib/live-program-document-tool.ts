import { tool } from "ai";
import { z } from "zod";

const readInput = z.object({ action: z.literal("read_live"), stepSchemaFor: z.string().min(1).optional() }).strict();
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
  changes: z.array(z.object({ key: z.string().min(1).max(256), value: z.string().max(100_000) }).strict()).max(32),
}).strict();
export const liveProgramDocumentInputSchema = z.discriminatedUnion("action", [readInput, editInput, editStepInputs]);

/** Uses the existing SDK client-tool callback and addToolOutput continuation. */
export function createLiveProgramDocumentTool(mode: "read" | "edit", scopeId: string) {
  return tool({
    description: "Read the explicitly pinned live Designer document, including unsaved edits. "
      + "read_live returns the actual revision, complete native JSON and step references. Add stepSchemaFor for a pinned step to read its native input contract and exact editableInputKeys. "
      + (mode === "read" ? "This turn is read-only. " : "edit_live changes one pinned step's note after read_live. edit_step_inputs_live changes existing editable input values only after read_live with stepSchemaFor for that same step. Pass that actual read tool call ID as readOperationId and its revision. Existing definitions and bindings are preserved, and closed options are enforced. This does not execute a module or prove that its text values can be converted to runtime types. Dynamic values, bindings and control fields are not supported by this input operation. ")
      + "Edits share the human editor's undo history and remain unsaved. No disk or Quicker write, export, save, sync or file editing is available through this tool. "
      + "On an unavailable target or conflict, retain the failure and read again only when the target is still valid; never fall back to another project or disk tools.",
    inputSchema: mode === "read" ? readInput.extend({ scopeId: z.literal(scopeId) })
      : z.discriminatedUnion("action", [readInput.extend({ scopeId: z.literal(scopeId) }), editInput.extend({ scopeId: z.literal(scopeId) }), editStepInputs.extend({ scopeId: z.literal(scopeId) })]),
  });
}

export function parseLiveProgramDocumentToolInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { scopeId, ...rest } = value as Record<string, unknown>;
  if (typeof scopeId !== "string" || !scopeId) return undefined;
  const parsed = liveProgramDocumentInputSchema.safeParse(rest);
  return parsed.success ? { scopeId, input: parsed.data } : undefined;
}
