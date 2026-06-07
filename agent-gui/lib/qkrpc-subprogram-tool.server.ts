import { tool } from "ai";
import { z } from "zod";
import {
  buildWorkspaceProjectSummary,
  parseQkrpcPayload,
} from "@/lib/action-project-workflow";
import {
  QKRPC_SUBPROGRAM_CREATE_TOOL,
  QKRPC_SUBPROGRAM_EDIT_TOOL,
  QKRPC_SUBPROGRAM_EDIT_VAR_TOOL,
  QKRPC_SUBPROGRAM_EXPORT_TOOL,
  QKRPC_SUBPROGRAM_GET_TOOL,
  QKRPC_SUBPROGRAM_IMPORT_TOOL,
  QKRPC_SUBPROGRAM_MANAGE_TOOL,
  QKRPC_SUBPROGRAM_QUERY_TOOL,
  QKRPC_SUBPROGRAM_TOOL,
} from "@/lib/qkrpc-subprogram-tool";
import {
  formatQkrpcResultForAgent,
  qkrpcValidationError,
  runQkrpcForTool,
  runQkrpcWithPatchFileForTool,
  runQkrpcWithProgramForTool,
} from "@/lib/qkrpc";
import { formatLocalToolResult } from "@/lib/tool-result";

const returnModeSchema = z.enum(["full", "structure", "metadata"]);

const SUBPROGRAM_WORKSPACE_REDIRECT =
  "Use workspace_program({ target: \"global_subprogram\", action: \"patch\", id }) — not subprogram patch/replace.";

const subprogramQuerySchema = z.object({
  query: z
    .string()
    .optional()
    .describe("Name keyword; empty = list all global subprograms"),
  limit: z.number().int().min(1).max(100).optional().describe("Max items (default 20)"),
});

export type QkrpcSubprogramQueryToolInput = z.infer<typeof subprogramQuerySchema>;

/** Strict parse schema (not sent to LLM). */
const subprogramIdInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("get"),
    id: z.string(),
    returnMode: returnModeSchema.optional(),
  }),
  z.object({
    action: z.literal("patch"),
    id: z.string(),
    patch: z.record(z.unknown()),
    expectedEditVersion: z.number().int().optional(),
    force: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("replace"),
    id: z.string(),
    program: z.record(z.unknown()),
    expectedEditVersion: z.number().int().optional(),
    force: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("export"),
    id: z.string(),
    dir: z.string(),
  }),
  z.object({
    action: z.literal("import"),
    dir: z.string(),
    expectedEditVersion: z.number().int().optional(),
    force: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("edit"),
    id: z.string(),
  }),
  z.object({
    action: z.literal("edit_var"),
    id: z.string(),
    var: z.string(),
    value: z.string(),
  }),
]);

export type QkrpcSubprogramIdToolInput = z.infer<typeof subprogramIdInputSchema>;

const subprogramIdSchema = z.object({
  action: z
    .enum(["get", "export", "import", "edit", "edit_var"])
    .describe(
      "get=sync workspace; export/import=dir; edit=Quicker UI; edit_var=one var. Body: workspace_program.",
    ),
  id: z.string().describe("Subprogram id or name"),
  returnMode: returnModeSchema.optional().describe("get: full | structure | metadata"),
  expectedEditVersion: z.number().int().optional().describe("import: expectedEditVersion"),
  force: z.boolean().optional().describe("import: force on conflict"),
  dir: z.string().optional().describe("export: output dir; import: source dir"),
  var: z.string().optional().describe("edit_var: variable key"),
  value: z.string().optional().describe("edit_var: new value"),
});

function formatZodToolInputError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ") || "Invalid tool input";
}

function parseSubprogramIdToolInput(
  input: z.infer<typeof subprogramIdSchema>,
):
  | { success: true; data: QkrpcSubprogramIdToolInput }
  | { success: false; message: string } {
  const parsed = subprogramIdInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: formatZodToolInputError(parsed.error) };
  }
  return { success: true, data: parsed.data };
}

const subprogramCreateSchema = z.object({
  name: z.string().describe("Subprogram name (unique)"),
  description: z.string().optional().describe("Optional summary"),
  icon: z.string().optional().describe("Optional fa: spec from qkrpc_fa search"),
});

export type QkrpcSubprogramCreateToolInput = z.infer<typeof subprogramCreateSchema>;

/** @deprecated Legacy manage router input. */
export type QkrpcSubprogramManageToolInput = QkrpcSubprogramCreateToolInput & {
  action: "create";
};

/** @deprecated Unified input for legacy tool aliases only. */
export type QkrpcSubprogramToolInput = QkrpcSubprogramQueryToolInput
  & Partial<QkrpcSubprogramIdToolInput>
  & Partial<QkrpcSubprogramManageToolInput> & {
    action?:
      | QkrpcSubprogramIdToolInput["action"]
      | QkrpcSubprogramManageToolInput["action"]
      | "list"
      | "search";
  };

export async function executeQkrpcSubprogramQueryTool(
  input: QkrpcSubprogramQueryToolInput,
): Promise<Record<string, unknown>> {
  const args = ["subprogram", "list"];
  if (input.query?.trim()) args.push("--query", input.query.trim());
  if (input.limit != null) args.push("--limit", String(input.limit));
  return formatQkrpcResultForAgent(await runQkrpcForTool(args));
}

export async function executeQkrpcSubprogramIdTool(
  input: QkrpcSubprogramIdToolInput,
): Promise<Record<string, unknown>> {
  switch (input.action) {
    case "get": {
      const args = ["subprogram", "get", "--id", input.id];
      if (input.returnMode) args.push("--return-mode", input.returnMode);
      const getResult = await runQkrpcForTool(args);
      if (!getResult.ok) {
        return formatQkrpcResultForAgent(getResult);
      }
      const { augmentSubprogramGetWithWorkspace, syncSubprogramGetToWorkspace } =
        await import("@/lib/subprogram-project-workflow");
      const sync = await syncSubprogramGetToWorkspace(input.id, getResult);
      return augmentSubprogramGetWithWorkspace(getResult, sync);
    }
    case "patch": {
      const base = ["subprogram", "patch", "--id", input.id];
      if (input.expectedEditVersion != null) {
        base.push("--expected-edit-version", String(input.expectedEditVersion));
      }
      if (input.force) base.push("--force");
      return formatQkrpcResultForAgent(
        await runQkrpcWithPatchFileForTool(base, input.patch),
      );
    }
    case "replace": {
      const base = ["subprogram", "replace", "--id", input.id];
      if (input.expectedEditVersion != null) {
        base.push("--expected-edit-version", String(input.expectedEditVersion));
      }
      if (input.force) base.push("--force");
      return formatQkrpcResultForAgent(
        await runQkrpcWithProgramForTool(base, input.program),
      );
    }
    case "export":
      return formatQkrpcResultForAgent(
        await runQkrpcForTool([
          "subprogram",
          "export",
          "--id",
          input.id,
          "--dir",
          input.dir,
        ]),
      );
    case "import": {
      const args = ["subprogram", "import", "--dir", input.dir];
      if (input.expectedEditVersion != null) {
        args.push("--expected-edit-version", String(input.expectedEditVersion));
      }
      if (input.force) args.push("--force");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "edit":
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(["subprogram", "edit", "--id", input.id]),
      );
    case "edit_var":
      return formatQkrpcResultForAgent(
        await runQkrpcForTool([
          "subprogram",
          "edit-var",
          "--id",
          input.id,
          "--var",
          input.var,
          "--value",
          input.value,
        ]),
      );
    default:
      return formatQkrpcResultForAgent(
        qkrpcValidationError(`Unknown action: ${String((input as { action?: string }).action)}`),
      );
  }
}

export async function executeQkrpcSubprogramCreateTool(
  input: QkrpcSubprogramCreateToolInput,
): Promise<Record<string, unknown>> {
  const args = ["subprogram", "create", "--name", input.name];
  if (input.description) args.push("--description", input.description);
  if (input.icon) args.push("--icon", input.icon);
  const createResult = await runQkrpcForTool(args);
  if (!createResult.ok) {
    return formatQkrpcResultForAgent(createResult);
  }
  const payload = parseQkrpcPayload(createResult);
  const subProgramId =
    typeof payload?.subProgramId === "string" ? payload.subProgramId : undefined;
  if (!subProgramId) {
    return formatQkrpcResultForAgent(createResult);
  }
  const { bootstrapSubprogramProjectForCreate } = await import(
    "@/lib/subprogram-project-workflow"
  );
  const sync = await bootstrapSubprogramProjectForCreate(payload ?? {}, {
    description: input.description,
    icon: input.icon,
  });
  const editVersion =
    sync.ok && sync.manifest.editVersion != null
      ? sync.manifest.editVersion
      : typeof payload?.editVersion === "number"
        ? payload.editVersion
        : undefined;
  const callIdentifier =
    sync.ok && sync.manifest.callIdentifier
      ? sync.manifest.callIdentifier
      : typeof payload?.callIdentifier === "string"
        ? payload.callIdentifier
        : undefined;
  const base = {
    ...((payload ?? {}) as Record<string, unknown>),
    action: "subprogram-create",
    ok: true,
    subProgramId,
    name:
      sync.ok && sync.manifest.name
        ? sync.manifest.name
        : typeof payload?.name === "string"
          ? payload.name
          : input.name,
    callIdentifier,
    editVersion,
  };
  if (!sync.ok) {
    return formatLocalToolResult(
      {
        ...base,
        workspaceSynced: false,
        workspaceSyncError: sync.error,
        workspaceSyncReason: sync.reason,
        workspaceNote:
          sync.reason === "no_cwd"
            ? "Quicker 中已创建子程序，但未落盘：请先在侧栏设置工作目录，再重试 create 或手动 export。"
            : sync.reason === "invalid_create"
              ? "Quicker 中已创建子程序，但 create 响应缺少 subProgramId，info.json 未写入。"
              : sync.reason === "get_failed"
                ? "Quicker 中已创建子程序，但 metadata get 失败，info.json 未写入完整标题。"
                : "Quicker 中已创建子程序，但 info.json 未写入工作区。",
      },
      true,
    );
  }
  return formatLocalToolResult({
    ...base,
    workspaceSynced: true,
    workspaceProject: buildWorkspaceProjectSummary({
      projectDirectory: sync.manifest.projectDirectory,
      title: sync.manifest.name,
      editVersion: sync.manifest.editVersion,
      fileRefs: [],
    }),
    workspaceNote:
      "已用 metadata get 写入 info.json（含标题）与空 data.json。下一步在编辑器或 workspace_program({ action: \"edit_data\", target: \"global_subprogram\" }) 添加步骤，再 patch。",
  });
}

/** @deprecated Use executeQkrpcSubprogramCreateTool. */
export async function executeQkrpcSubprogramManageTool(
  input: QkrpcSubprogramManageToolInput,
): Promise<Record<string, unknown>> {
  return executeQkrpcSubprogramCreateTool(input);
}

/** Legacy unified router for deprecated per-action tool aliases. */
export async function executeQkrpcSubprogramTool(
  input: QkrpcSubprogramToolInput,
): Promise<Record<string, unknown>> {
  const action = input.action;
  if (action === "list" || action === "search") {
    return executeQkrpcSubprogramQueryTool(input);
  }
  if (action === "create") {
    if (!input.name?.trim()) {
      return formatQkrpcResultForAgent(qkrpcValidationError("name is required for create"));
    }
    return executeQkrpcSubprogramManageTool({
      action: "create",
      name: input.name,
      description: input.description,
      icon: input.icon,
    });
  }

  const idActions = new Set([
    "get",
    "patch",
    "replace",
    "export",
    "import",
    "edit",
    "edit_var",
  ]);
  if (action && idActions.has(action)) {
    return executeQkrpcSubprogramIdTool(input as QkrpcSubprogramIdToolInput);
  }

  return formatQkrpcResultForAgent(
    qkrpcValidationError(`Unknown action: ${String(action)}`),
  );
}

export const QKRPC_SUBPROGRAM_QUERY_TOOL_DEF = tool({
  description:
    "Find global subprograms by name. Use before sys:subprogram steps — need callIdentifier from get. "
    + "Not for embedded subprograms (workspace_program target=embedded_subprogram).",
  inputSchema: subprogramQuerySchema,
  execute: async (input) => executeQkrpcSubprogramQueryTool(input),
});

export const QKRPC_SUBPROGRAM_GET_TOOL_DEF = tool({
  description:
    "Sync one global subprogram to .quicker/subprograms/{id}/ (first time). "
    + "After create skip re-get — use workspace_program. NOT body edits.",
  inputSchema: z.object({
    id: z.string().describe("Subprogram id or name"),
    returnMode: returnModeSchema
      .optional()
      .describe("full | structure | metadata"),
  }),
  execute: async (input) =>
    executeQkrpcSubprogramIdTool({ action: "get", ...input }),
});

export const QKRPC_SUBPROGRAM_EXPORT_TOOL_DEF = tool({
  description: "Export one global subprogram project to a directory.",
  inputSchema: z.object({
    id: z.string().describe("Subprogram id or name"),
    dir: z.string().describe("Output directory path"),
  }),
  execute: async (input) =>
    executeQkrpcSubprogramIdTool({ action: "export", ...input }),
});

export const QKRPC_SUBPROGRAM_IMPORT_TOOL_DEF = tool({
  description: "Import a global subprogram project from a directory.",
  inputSchema: z.object({
    dir: z.string().describe("Source directory path"),
    expectedEditVersion: z.number().int().optional(),
    force: z.boolean().optional().describe("Ignore editVersion conflict"),
  }),
  execute: async (input) =>
    executeQkrpcSubprogramIdTool({ action: "import", ...input }),
});

export const QKRPC_SUBPROGRAM_EDIT_TOOL_DEF = tool({
  description: "Open one global subprogram in Quicker desktop designer UI.",
  inputSchema: z.object({
    id: z.string().describe("Subprogram id or name"),
  }),
  execute: async ({ id }) => executeQkrpcSubprogramIdTool({ action: "edit", id }),
});

export const QKRPC_SUBPROGRAM_EDIT_VAR_TOOL_DEF = tool({
  description: "Set one global subprogram variable in Quicker (not disk edit).",
  inputSchema: z.object({
    id: z.string().describe("Subprogram id or name"),
    var: z.string().describe("Variable key"),
    value: z.string().describe("New value"),
  }),
  execute: async (input) =>
    executeQkrpcSubprogramIdTool({ action: "edit_var", ...input }),
});

export const QKRPC_SUBPROGRAM_CREATE_TOOL_DEF = tool({
  description:
    "Create a new global subprogram and bootstrap .quicker/subprograms/{id}/. "
    + "After create edit via workspace_program (target=global_subprogram) — do not re-get. "
    + "NOT embedded subprograms. Delete: qkrpc_subprogram_delete.",
  inputSchema: subprogramCreateSchema,
  execute: async (input) => executeQkrpcSubprogramCreateTool(input),
});

/** @deprecated Consolidated-era router — legacy replay only. */
export const QKRPC_SUBPROGRAM_TOOL_DEF = tool({
  description: "Deprecated: use qkrpc_subprogram_get / export / import / edit / edit_var.",
  inputSchema: subprogramIdSchema,
  execute: async (input) => {
    const parsed = parseSubprogramIdToolInput(input);
    if (!parsed.success) {
      return formatQkrpcResultForAgent(qkrpcValidationError(parsed.message));
    }
    return executeQkrpcSubprogramIdTool(parsed.data);
  },
});

/** @deprecated Consolidated-era router — legacy replay only. */
export const QKRPC_SUBPROGRAM_MANAGE_TOOL_DEF = tool({
  description: "Deprecated: use qkrpc_subprogram_create.",
  inputSchema: z.object({
    action: z.literal("create"),
    name: z.string(),
    description: z.string().optional(),
    icon: z.string().optional(),
  }),
  execute: async (input) => executeQkrpcSubprogramManageTool(input),
});

export {
  QKRPC_SUBPROGRAM_CREATE_TOOL,
  QKRPC_SUBPROGRAM_EDIT_TOOL,
  QKRPC_SUBPROGRAM_EDIT_VAR_TOOL,
  QKRPC_SUBPROGRAM_EXPORT_TOOL,
  QKRPC_SUBPROGRAM_GET_TOOL,
  QKRPC_SUBPROGRAM_IMPORT_TOOL,
  QKRPC_SUBPROGRAM_MANAGE_TOOL,
  QKRPC_SUBPROGRAM_QUERY_TOOL,
  QKRPC_SUBPROGRAM_TOOL,
};
