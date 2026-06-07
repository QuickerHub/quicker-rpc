import { tool } from "ai";
import { z } from "zod";
import {
  actionCreateSchema,
  resolveActionCreateManageInput,
  type QkrpcActionCreateToolInput,
} from "@/lib/action-create-input";
import { registerLocalActionProject } from "@/lib/action-scope";
import {
  augmentActionGetWithWorkspace,
  bootstrapActionProjectForCreate,
  buildWorkspaceProjectSummary,
  parseQkrpcPayload,
  programHasBodyFromGetPayload,
  syncActionToWorkspace,
} from "@/lib/action-project-workflow";
import {
  QKRPC_ACTION_CREATE_TOOL,
  QKRPC_ACTION_MANAGE_TOOL,
  QKRPC_ACTION_QUERY_TOOL,
  QKRPC_ACTION_TOOL,
  normalizeQkrpcActionInput,
} from "@/lib/qkrpc-action-tool";
import {
  formatQkrpcResultForAgent,
  qkrpcValidationError,
  runQkrpcForTool,
  runQkrpcWithXactionForTool,
} from "@/lib/qkrpc";
import { runActionTraceForAgentTool } from "@/lib/action-trace-stream.server";
import { formatLocalToolResult } from "@/lib/tool-result";

const returnModeSchema = z.enum(["full", "structure", "metadata"]);

const actionQuerySchema = z.object({
  query: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  queryFile: z.string().optional(),
  fields: z.union([z.string(), z.array(z.string())]).optional(),
  scope: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  sort: z.enum(["relevance", "lastEdit", "title"]).optional(),
});

export type QkrpcActionQueryToolInput = z.infer<typeof actionQuerySchema>;

/** Strict parse schema (not sent to LLM — discriminatedUnion → JSON Schema type null on some providers). */
const actionIdInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("get"),
    id: z.string().uuid(),
    returnMode: returnModeSchema.optional(),
  }),
  z.object({
    action: z.literal("run"),
    id: z.string(),
    param: z.string().optional(),
    wait: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("debug"),
    id: z.string(),
    param: z.string().optional(),
  }),
  z.object({
    action: z.literal("float"),
    id: z.string(),
  }),
  z.object({
    action: z.literal("edit"),
    id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("edit_var"),
    id: z.string(),
    var: z.string(),
    value: z.string(),
  }),
  z.object({
    action: z.literal("set_metadata"),
    id: z.string().uuid(),
    title: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    expectedEditVersion: z.number().int().optional(),
    force: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("move"),
    id: z.string().uuid(),
    profile: z.string(),
    row: z.number().int().min(0).optional(),
    col: z.number().int().min(0).optional(),
    swap: z.boolean().optional(),
    onNoEmptySlot: z.enum(["ask", "cancel", "createPageAfter"]).optional(),
    onOccupiedSlot: z.enum(["ask", "cancel", "swap"]).optional(),
  }),
  z.object({
    action: z.literal("publish"),
    id: z.string().uuid(),
    title: z.string().optional(),
    description: z.string().optional(),
    note: z.string().optional(),
    tags: z.string().optional(),
    keywords: z.string().optional(),
    changelog: z.string().optional(),
    isPublic: z.boolean().optional(),
    submitReview: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("replace"),
    id: z.string().uuid(),
    xaction: z.record(z.unknown()),
    expectedEditVersion: z.number().int().optional(),
    force: z.boolean().optional(),
  }),
]);

export type QkrpcActionIdToolInput = z.infer<typeof actionIdInputSchema>;

/** Flat object schema for LLM tool definitions (requires top-level type: object). */
const actionIdSchema = z.object({
  action: z
    .enum([
      "get",
      "run",
      "debug",
      "float",
      "edit",
      "edit_var",
      "set_metadata",
      "move",
      "publish",
      "replace",
    ])
    .describe(
      "Operation: run=execute action; debug=step-by-step terminal debug (opens side panel). "
      + "Use debug — not run — when you need execution details.",
    ),
  id: z.string().optional().describe("Action GUID or id"),
  returnMode: returnModeSchema.optional(),
  param: z.string().optional().describe("Optional input passed to the action when running or debugging"),
  wait: z
    .boolean()
    .optional()
    .describe("For run only: wait until the action finishes before returning"),
  var: z.string().optional(),
  value: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  expectedEditVersion: z.number().int().optional(),
  force: z.boolean().optional(),
  profile: z.string().optional(),
  row: z.number().int().min(0).optional(),
  col: z.number().int().min(0).optional(),
  swap: z.boolean().optional(),
  onNoEmptySlot: z.enum(["ask", "cancel", "createPageAfter"]).optional(),
  onOccupiedSlot: z.enum(["ask", "cancel", "swap"]).optional(),
  note: z.string().optional(),
  tags: z.string().optional(),
  keywords: z.string().optional(),
  changelog: z.string().optional(),
  isPublic: z.boolean().optional(),
  submitReview: z.boolean().optional(),
  xaction: z.record(z.unknown()).optional(),
}).passthrough();

/** Strict parse schema (not sent to LLM). */
const actionManageInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    title: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    profileId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("profile_create"),
    count: z.number().int().min(1).max(20).optional(),
    afterFirst: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("profile_delete"),
    profileIds: z.array(z.string()).optional(),
    profileId: z.string().optional(),
    id: z.string().optional(),
  }),
  z.object({
    action: z.literal("profile_prune"),
    scope: z.string().optional(),
    exeFile: z.string().optional(),
  }),
  z.object({
    action: z.literal("profile_reorder"),
    profileIds: z.array(z.string()).min(1),
  }),
  z.object({
    action: z.literal("process_ensure"),
    exeFile: z.string(),
    displayName: z.string(),
    profileNamePrefix: z.string(),
    collectSubProgramName: z.string().optional(),
    moveActions: z.boolean().optional(),
    moveAny: z.boolean().optional(),
  }),
]);

export type QkrpcActionManageToolInput = z.infer<typeof actionManageInputSchema>;

const actionManageSchema = z.object({
  action: z
    .enum([
      "profile_create",
      "profile_delete",
      "profile_prune",
      "profile_reorder",
      "process_ensure",
    ])
    .describe(
      "Layout operation only — to create a new action use qkrpc_action_create({ info: { title, ... } })",
    ),
  profileId: z.string().optional(),
  count: z.number().int().min(1).max(20).optional(),
  afterFirst: z.boolean().optional(),
  profileIds: z.array(z.string()).optional(),
  id: z.string().optional(),
  scope: z.string().optional(),
  exeFile: z.string().optional(),
  displayName: z.string().optional(),
  profileNamePrefix: z.string().optional(),
  collectSubProgramName: z.string().optional(),
  moveActions: z.boolean().optional(),
  moveAny: z.boolean().optional(),
});

type ToolParseResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

function formatZodToolInputError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ") || "Invalid tool input";
}

function parseActionIdToolInput(
  input: z.infer<typeof actionIdSchema>,
): ToolParseResult<QkrpcActionIdToolInput> {
  const normalized = normalizeQkrpcActionInput(input) as z.infer<typeof actionIdSchema>;
  const parsed = actionIdInputSchema.safeParse(normalized);
  if (!parsed.success) {
    return { success: false, message: formatZodToolInputError(parsed.error) };
  }
  return { success: true, data: parsed.data };
}

function parseActionManageToolInput(
  input: z.infer<typeof actionManageSchema>,
): ToolParseResult<QkrpcActionManageToolInput> {
  const parsed = actionManageInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: formatZodToolInputError(parsed.error) };
  }
  return { success: true, data: parsed.data };
}

export { actionCreateSchema, resolveActionCreateManageInput };
export type { QkrpcActionCreateToolInput } from "@/lib/action-create-input";

/** @deprecated Unified input for legacy tool aliases only. */
export type QkrpcActionToolInput = QkrpcActionQueryToolInput
  & Partial<QkrpcActionIdToolInput>
  & Partial<QkrpcActionManageToolInput> & {
    action?:
      | QkrpcActionIdToolInput["action"]
      | QkrpcActionManageToolInput["action"]
      | "list"
      | "search";
    filter?: "library" | "installed" | "local" | "published";
    program?: Record<string, unknown>;
    patch?: Record<string, unknown>;
  };

function serializeActionQuery(
  query: string | Record<string, unknown> | undefined,
): string {
  if (query == null) return "";
  if (typeof query === "string") return query.trim();
  return JSON.stringify(query);
}

function serializeActionFields(
  fields: string | string[] | undefined,
): string {
  if (fields == null) return "";
  if (Array.isArray(fields)) return fields.map((f) => f.trim()).filter(Boolean).join(",");
  return fields.trim();
}

export async function executeQkrpcActionQueryTool(
  input: QkrpcActionQueryToolInput,
): Promise<Record<string, unknown>> {
  const args = ["action", "list"];
  const serialized = serializeActionQuery(input.query);
  if (serialized) args.push("--query", serialized);
  if (input.queryFile) args.push("--query-file", input.queryFile);
  const serializedFields = serializeActionFields(input.fields);
  if (serializedFields) args.push("--fields", serializedFields);
  if (input.scope) args.push("--scope", input.scope);
  if (input.limit != null) args.push("--limit", String(input.limit));
  if (input.sort) args.push("--sort", input.sort);
  else if (!serialized && !input.queryFile) args.push("--sort", "lastEdit");
  return formatQkrpcResultForAgent(await runQkrpcForTool(args));
}

export async function executeQkrpcActionIdTool(
  input: QkrpcActionIdToolInput,
): Promise<Record<string, unknown>> {
  switch (input.action) {
    case "get": {
      const args = ["action", "get", "--id", input.id];
      args.push("--return-mode", input.returnMode ?? "structure");
      const getResult = await runQkrpcForTool(args);
      if (!getResult.ok) {
        return formatQkrpcResultForAgent(getResult);
      }
      const payload = parseQkrpcPayload(getResult);
      const sync = programHasBodyFromGetPayload(payload)
        ? await syncActionToWorkspace(input.id)
        : {
            ok: false as const,
            reason: "empty_program" as const,
            error:
              "Action has no steps or variables; skipped extract to avoid writing an empty data.json.",
          };
      if (sync.ok) {
        registerLocalActionProject(input.id);
      }
      return augmentActionGetWithWorkspace(getResult, sync);
    }
    case "replace": {
      const base = ["action", "replace", "--id", input.id];
      if (input.expectedEditVersion != null) {
        base.push("--expected-edit-version", String(input.expectedEditVersion));
      }
      if (input.force) base.push("--force");
      return formatQkrpcResultForAgent(
        await runQkrpcWithXactionForTool(base, input.xaction),
      );
    }
    case "publish": {
      const args = ["action", "publish", "--id", input.id];
      if (input.title) args.push("--title", input.title);
      if (input.description) args.push("--description", input.description);
      if (input.note) args.push("--share-note", input.note);
      if (input.tags) args.push("--tags", input.tags);
      if (input.keywords) args.push("--keywords", input.keywords);
      if (input.changelog) args.push("--changelog", input.changelog);
      if (input.isPublic === false) args.push("--private");
      if (input.submitReview === false) args.push("--no-submit-review");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "float":
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(["action", "float", "--id", input.id]),
      );
    case "edit":
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(["action", "edit", "--id", input.id]),
      );
    case "edit_var":
      return formatQkrpcResultForAgent(
        await runQkrpcForTool([
          "action",
          "edit-var",
          "--id",
          input.id,
          "--var",
          input.var,
          "--value",
          input.value,
        ]),
      );
    case "set_metadata": {
      const args = ["action", "set-metadata", "--id", input.id];
      if (input.title != null) args.push("--title", input.title);
      if (input.description != null) args.push("--description", input.description);
      if (input.icon != null) args.push("--icon", input.icon);
      if (input.expectedEditVersion != null) {
        args.push("--expected-edit-version", String(input.expectedEditVersion));
      }
      if (input.force) args.push("--force");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "debug":
      return formatQkrpcResultForAgent(
        await runActionTraceForAgentTool({
          id: input.id,
          param: input.param,
        }),
      );
    case "run": {
      const args = ["action", "run", "--id", input.id];
      if (input.param) args.push("--param", input.param);
      if (input.wait) args.push("--wait");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "move": {
      const args = ["action", "move", "--id", input.id, "--profile", input.profile];
      if (input.row != null) args.push("--row", String(input.row));
      if (input.col != null) args.push("--col", String(input.col));
      if (input.swap) args.push("--swap");
      if (input.onNoEmptySlot === "createPageAfter") {
        args.push("--on-no-empty-slot", "create-page-after");
      } else if (input.onNoEmptySlot != null) {
        args.push("--on-no-empty-slot", input.onNoEmptySlot);
      }
      if (input.onOccupiedSlot != null) {
        args.push("--on-occupied-slot", input.onOccupiedSlot);
      }
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    default:
      return formatQkrpcResultForAgent(
        qkrpcValidationError(`Unknown action: ${String((input as { action?: string }).action)}`),
      );
  }
}

export async function executeQkrpcActionCreateTool(
  input: QkrpcActionCreateToolInput,
): Promise<Record<string, unknown>> {
  const parsed = resolveActionCreateManageInput(input);
  if (!parsed.success) {
    return formatQkrpcResultForAgent(qkrpcValidationError(parsed.message));
  }
  return executeQkrpcActionManageTool(parsed.data);
}

export async function executeQkrpcActionManageTool(
  input: QkrpcActionManageToolInput,
): Promise<Record<string, unknown>> {
  switch (input.action) {
    case "create": {
      const args = ["action", "create"];
      if (input.title) args.push("--title", input.title);
      if (input.description) args.push("--description", input.description);
      if (input.icon) args.push("--icon", input.icon);
      if (input.profileId) args.push("--profile-id", input.profileId);
      const createResult = await runQkrpcForTool(args);
      if (!createResult.ok) {
        return formatQkrpcResultForAgent(createResult);
      }
      const payload = parseQkrpcPayload(createResult);
      const actionId =
        typeof payload?.actionId === "string" ? payload.actionId : undefined;
      if (!actionId) {
        return formatQkrpcResultForAgent(createResult);
      }
      const sync = await bootstrapActionProjectForCreate(payload ?? {}, {
        title: input.title,
        description: input.description,
        icon: input.icon,
      });
      const editVersion =
        sync.ok && sync.manifest.editVersion != null
          ? sync.manifest.editVersion
          : typeof payload?.editVersion === "number"
            ? payload.editVersion
            : undefined;
      const base = {
        ...((payload ?? {}) as Record<string, unknown>),
        action: "create",
        ok: true,
        actionId,
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
                ? "Quicker 中已创建动作，但未落盘：请先在侧栏设置工作目录，再重试 create 或手动 extract。"
                : sync.reason === "invalid_create"
                  ? "Quicker 中已创建动作，但 create 响应缺少 actionId，info.json 未写入。"
                  : "Quicker 中已创建动作，但 info.json 未写入工作区。",
          },
          true,
        );
      }
      return formatLocalToolResult({
        ...base,
        workspaceSynced: true,
        workspaceProject: buildWorkspaceProjectSummary(sync.manifest),
        workspaceNote:
          "已用 create 返回值写入 info.json 与空 data.json。下一步在编辑器或 workspace_program({ action: \"edit_data\" }) 添加步骤，再 workspace_program({ action: \"patch\" })；勿再对 Agent 调用 get。",
      });
    }
    case "profile_create": {
      const args = ["profile", "create", "--scope", "global"];
      if (input.count != null) args.push("--count", String(input.count));
      if (input.afterFirst) args.push("--after-first");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "profile_delete": {
      const ids = input.profileIds?.length
        ? input.profileIds
        : input.profileId
          ? [input.profileId]
          : input.id
            ? [input.id]
            : [];
      if (ids.length === 0) {
        return { ok: false, message: "profileIds or id is required." };
      }
      const args = ["profile", "delete"];
      if (ids.length === 1) {
        args.push("--id", ids[0]!);
      } else {
        args.push("--ids", ids.join(","));
      }
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "profile_prune": {
      const pruneScope = input.scope?.trim() || input.exeFile?.trim();
      if (!pruneScope) {
        return formatQkrpcResultForAgent(
          qkrpcValidationError("scope or exeFile is required for profile_prune"),
        );
      }
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(["profile", "prune", "--scope", pruneScope]),
      );
    }
    case "profile_reorder": {
      const args = [
        "profile",
        "reorder",
        "--scope",
        "global",
        "--after-first",
        "--ids",
        input.profileIds.join(","),
      ];
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "process_ensure": {
      const args = [
        "process",
        "ensure",
        "--exe",
        input.exeFile,
        "--name",
        input.displayName,
        "--profile-prefix",
        input.profileNamePrefix,
      ];
      if (input.moveActions) {
        args.push("--move-actions");
        if (input.collectSubProgramName) {
          args.push("--collect-subprogram", input.collectSubProgramName);
        }
        if (input.moveAny) args.push("--move-any");
      }
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    default:
      return formatQkrpcResultForAgent(
        qkrpcValidationError(`Unknown action: ${String((input as { action?: string }).action)}`),
      );
  }
}

/** Legacy unified router for deprecated per-action tool aliases. */
export async function executeQkrpcActionTool(
  input: QkrpcActionToolInput,
): Promise<Record<string, unknown>> {
  const action = input.action;
  if (action === "list" || action === "search") {
    if (action === "search") {
      const serialized = serializeActionQuery(input.query);
      if (!serialized && !input.queryFile) {
        return formatQkrpcResultForAgent(
          qkrpcValidationError("query or queryFile is required for search"),
        );
      }
    }
    return executeQkrpcActionQueryTool(input);
  }

  const idActions = new Set([
    "get",
    "run",
    "float",
    "edit",
    "edit_var",
    "set_metadata",
    "move",
    "publish",
    "replace",
  ]);
  if (action && idActions.has(action)) {
    return executeQkrpcActionIdTool(input as QkrpcActionIdToolInput);
  }

  const manageActions = new Set([
    "create",
    "profile_create",
    "profile_delete",
    "profile_prune",
    "profile_reorder",
    "process_ensure",
  ]);
  if (action && manageActions.has(action)) {
    return executeQkrpcActionManageTool(input as QkrpcActionManageToolInput);
  }

  return formatQkrpcResultForAgent(
    qkrpcValidationError(`Unknown action: ${String(action)}`),
  );
}

const ACTION_QUERY_DESCRIPTION =
  "Search/list Quicker actions via action list. Optional query: plain text, legacy prefixes (source:library, uses:Sub), "
  + "or JSON { keyword?, fields?: [actionId,title,...] or \"*\", filter: { source, uses, usesOnly, keyword, script }, sort: { key, by, desc } }. "
  + "Optional fields (or --fields) trims returned columns. Empty query returns recent actions (lastEdit). UI renders the table — summarize only, no markdown table.";

export const QKRPC_ACTION_QUERY_TOOL_DEF = tool({
  description: ACTION_QUERY_DESCRIPTION,
  inputSchema: actionQuerySchema,
  execute: async (input) => executeQkrpcActionQueryTool(input),
});

export const QKRPC_ACTION_TOOL_DEF = tool({
  description:
    "Operate on one action by id: get (sync workspace when non-empty), run (execute), debug (terminal step debug — "
    + "use when you need step output; opens side panel), float, edit (Quicker UI), "
    + "edit_var, set_metadata, move, publish, replace. Disk editing uses workspace_program.",
  inputSchema: actionIdSchema,
  execute: async (input) => {
    const parsed = parseActionIdToolInput(input);
    if (!parsed.success) {
      return formatQkrpcResultForAgent(qkrpcValidationError(parsed.message));
    }
    return executeQkrpcActionIdTool(parsed.data);
  },
});

export const QKRPC_ACTION_CREATE_TOOL_DEF = tool({
  description:
    "Create a new Quicker action and bootstrap .quicker/actions/{id}/ with info.json + empty data.json. "
    + "Pass only info.json fields in info: { title (required), description?, icon? }. "
    + "Do not pass layout/profile/process fields. After create, edit steps via workspace_program — do not qkrpc_action get.",
  inputSchema: actionCreateSchema,
  execute: async (input) => executeQkrpcActionCreateTool(input),
});

export const QKRPC_ACTION_MANAGE_TOOL_DEF = tool({
  description:
    "Manage action pages and virtual process layout: profile_create/delete/prune/reorder, process_ensure. "
    + "To create a new action use qkrpc_action_create({ info: { title, description?, icon? } }). "
    + "See docs action-organization-workflow.",
  inputSchema: actionManageSchema,
  execute: async (input) => {
    const parsed = parseActionManageToolInput(input);
    if (!parsed.success) {
      return formatQkrpcResultForAgent(qkrpcValidationError(parsed.message));
    }
    return executeQkrpcActionManageTool(parsed.data);
  },
});

export {
  QKRPC_ACTION_CREATE_TOOL,
  QKRPC_ACTION_MANAGE_TOOL,
  QKRPC_ACTION_QUERY_TOOL,
  QKRPC_ACTION_TOOL,
};
