import { z } from "zod";
import { programDataSchema } from "@/lib/program-data-input";

/** info.json user fields (id / editVersion / exportedUtc are server-assigned). */
export const actionInfoCreateSchema = z.object({
  title: z.string().min(1).describe("Action title (info.json title)"),
  description: z
    .string()
    .optional()
    .describe("Optional summary (info.json description)"),
  icon: z
    .string()
    .optional()
    .describe("Optional icon spec e.g. fa:Light_* (info.json icon)"),
});

export const actionCreateSchema = z.object({
  info: actionInfoCreateSchema.describe(
    "JSON object — NOT a string. Example: { title: \"My action\", description?: \"…\", icon?: \"fa:Light_*\" }. "
    + "Wrong: info: \"{\\\"title\\\":...}\" (stringified JSON fails validation). "
    + "Fields only — no id/editVersion/exportedUtc.",
  ),
  data: programDataSchema.optional().describe(
    "Optional data.json body ({ steps, variables }). When set, writes this directly instead of an empty data.json — then workspace_program patch. Schema: docs get action-data-schema.",
  ),
});

export type QkrpcActionCreateToolInput = z.infer<typeof actionCreateSchema>;

import type { ProgramDataInput } from "@/lib/program-data-input";
import { normalizeProgramDataInput } from "@/lib/program-data-input";

export type ActionCreateManagePayload = {
  action: "create";
  title: string;
  description?: string;
  icon?: string;
  profileId?: string;
  programData?: ProgramDataInput;
};

export type ActionCreateInputParseResult =
  | { success: true; data: ActionCreateManagePayload }
  | { success: false; message: string };

export function resolveActionCreateManageInput(
  input: QkrpcActionCreateToolInput & {
    title?: string;
    description?: string;
    icon?: string;
    profileId?: string;
  },
): ActionCreateInputParseResult {
  const info = input.info;
  const title = (info?.title ?? input.title ?? "").trim();
  if (!title) {
    return { success: false, message: "info.title is required" };
  }
  const programData =
    input.data != null ? normalizeProgramDataInput(input.data) : undefined;
  if (input.data != null && !programData) {
    return {
      success: false,
      message: "data must be an object with steps[] and variables[] arrays.",
    };
  }
  return {
    success: true,
    data: {
      action: "create",
      title,
      description: (info?.description ?? input.description)?.trim() || undefined,
      icon: (info?.icon ?? input.icon)?.trim() || undefined,
      profileId: input.profileId,
      programData,
    },
  };
}
