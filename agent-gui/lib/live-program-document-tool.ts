import { tool } from "ai";
import { z } from "zod";

const readInput = z.object({ action: z.literal("read_live") }).strict();
const editInput = z.object({
  action: z.literal("edit_live"),
  readOperationId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  stepId: z.string().min(1),
  note: z.string(),
}).strict();
export const liveProgramDocumentInputSchema = z.discriminatedUnion("action", [readInput, editInput]);

/** Uses the existing SDK client-tool callback and addToolOutput continuation. */
export function createLiveProgramDocumentTool(mode: "read" | "edit", scopeId: string) {
  return tool({
    description: "Read the explicitly pinned live Designer document, including unsaved edits. "
      + "read_live returns the actual revision, complete native JSON and step references. "
      + (mode === "read" ? "This turn is read-only. " : "edit_live changes only one unique step's note; first call read_live and pass its actual tool call ID as readOperationId and returned revision. ")
      + "Edits share the human editor's undo history and remain unsaved. No disk or Quicker write, export, save, sync or file editing is available through this tool. "
      + "On an unavailable target or conflict, retain the failure and read again only when the target is still valid; never fall back to another project or disk tools.",
    inputSchema: mode === "read" ? readInput.extend({ scopeId: z.literal(scopeId) })
      : z.discriminatedUnion("action", [readInput.extend({ scopeId: z.literal(scopeId) }), editInput.extend({ scopeId: z.literal(scopeId) })]),
  });
}

export function parseLiveProgramDocumentToolInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { scopeId, ...rest } = value as Record<string, unknown>;
  if (typeof scopeId !== "string" || !scopeId) return undefined;
  const parsed = liveProgramDocumentInputSchema.safeParse(rest);
  return parsed.success ? { scopeId, input: parsed.data } : undefined;
}
