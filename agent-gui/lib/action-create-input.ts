import { z } from "zod";

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
    "info.json metadata only — do not pass id, editVersion, or exportedUtc",
  ),
});

export type QkrpcActionCreateToolInput = z.infer<typeof actionCreateSchema>;

export type ActionCreateManagePayload = {
  action: "create";
  title: string;
  description?: string;
  icon?: string;
  profileId?: string;
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
  return {
    success: true,
    data: {
      action: "create",
      title,
      description: (info?.description ?? input.description)?.trim() || undefined,
      icon: (info?.icon ?? input.icon)?.trim() || undefined,
      profileId: input.profileId,
    },
  };
}
