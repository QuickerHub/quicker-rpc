import { tool } from "ai";
import { z } from "zod";
import { describeLiveProgramDocumentOperations } from "./live-program-document-protocol";

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
  changes: z.array(z.object({ key: z.string().min(1).max(256), value: z.string().max(100_000) }).strict()).min(1).max(32),
}).strict();
export const liveProgramDocumentInputSchema = z.discriminatedUnion("action", [readInput, editInput, editStepInputs]);

/** Uses the existing SDK client-tool callback and addToolOutput continuation. */
export function createLiveProgramDocumentTool(mode: "read" | "edit", scopeId: string) {
  return tool({
    description: "Read the explicitly pinned live Designer document, including unsaved edits. "
      + describeLiveProgramDocumentOperations(mode),
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
