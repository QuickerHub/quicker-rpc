import { z } from "zod";

export const WORKSPACE_PROGRAM_TARGETS = [
  "action",
  "global_subprogram",
  "embedded_subprogram",
] as const;

export type WorkspaceProgramTargetKind = (typeof WORKSPACE_PROGRAM_TARGETS)[number];

export const workspaceProgramTargetSchema = z
  .enum(WORKSPACE_PROGRAM_TARGETS)
  .default("action")
  .describe(
    "action: .quicker/actions/{guid}/; "
    + "global_subprogram: .quicker/subprograms/{id|name}/; "
    + "embedded_subprogram: .quicker/actions/{actionId}/subprograms/{subProgramId}/",
  );

export const workspaceProgramIdSchema = {
  target: workspaceProgramTargetSchema,
  id: z
    .string()
    .min(1)
    .describe(
      "action GUID (target=action); subprogram id or name (global_subprogram); "
      + "parent action GUID (embedded_subprogram)",
    ),
  subProgramId: z
    .string()
    .optional()
    .describe("Embedded subprogram id — required when target=embedded_subprogram"),
};

export const workspaceProgramTargetFields = z.object(workspaceProgramIdSchema);
