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
  QKRPC_ACTION_DEBUG_TOOL,
  QKRPC_ACTION_EDIT_TOOL,
  QKRPC_ACTION_EDIT_VAR_TOOL,
  QKRPC_ACTION_FLOAT_TOOL,
  QKRPC_ACTION_GET_TOOL,
  QKRPC_ACTION_MANAGE_TOOL,
  QKRPC_ACTION_MOVE_TOOL,
  QKRPC_ACTION_PUBLISH_TOOL,
  QKRPC_ACTION_QUERY_TOOL,
  QKRPC_ACTION_RUN_TOOL,
  QKRPC_ACTION_SET_METADATA_TOOL,
  QKRPC_ACTION_TOOL,
  QKRPC_PROCESS_ENSURE_TOOL,
  QKRPC_PROFILE_CREATE_TOOL,
  QKRPC_PROFILE_DELETE_TOOL,
  QKRPC_PROFILE_PRUNE_TOOL,
  QKRPC_PROFILE_REORDER_TOOL,
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
  query: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .optional()
    .describe("Keyword, JSON filter, or uses:SubName; empty = recent actions"),
  queryFile: z.string().optional().describe("Path to JSON query file on disk"),
  fields: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Columns to return (comma string or array)"),
  scope: z.string().optional().describe("Profile/scope id or name filter"),
  limit: z.number().int().min(1).max(100).optional().describe("Max items (default 20)"),
  sort: z
    .enum(["relevance", "lastEdit", "title"])
    .optional()
    .describe("Sort order when query is set"),
});

export type QkrpcActionQueryToolInput = z.infer<typeof actionQuerySchema>;

const WORKSPACE_REDIRECT =
  "Use workspace_program (read_data/edit_data/file_* → patch) — not qkrpc_action replace/patch.";

/** Strict parse for run/debug/float only. */
const actionRunInputSchema = z.discriminatedUnion("action", [
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
]);

export type QkrpcActionRunToolInput = z.infer<typeof actionRunInputSchema>;

const actionRunSchema = z.object({
  action: z
    .enum(["run", "debug", "float"])
    .describe("run=execute; debug=step trace (side panel) when output needed; float=popup"),
  id: z.string().describe("Action GUID"),
  param: z.string().optional().describe("quicker_in_param for run/debug"),
  wait: z.boolean().optional().describe("run only: block until finished"),
});

/** Strict parse schema (not sent to LLM — discriminatedUnion → JSON Schema type null on some providers). */
const actionIdInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("get"),
    id: z.string().uuid(),
    returnMode: returnModeSchema.optional(),
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
]);

export type QkrpcActionIdToolInput = z.infer<typeof actionIdInputSchema>;

/** Flat object schema for LLM tool definitions (requires top-level type: object). */
const actionIdSchema = z.object({
  action: z
    .enum([
      "get",
      "edit",
      "edit_var",
      "set_metadata",
      "move",
      "publish",
    ])
    .describe(
      "get=sync workspace (not after create); edit=Quicker UI; edit_var=one var; "
      + "set_metadata=title/icon; move=grid; publish=share. Run/debug: qkrpc_action_run. Body edits: workspace_program.",
    ),
  id: z.string().describe("Action GUID"),
  returnMode: returnModeSchema
    .optional()
    .describe("get only: full | structure | metadata"),
  var: z.string().optional().describe("edit_var: variable key"),
  value: z.string().optional().describe("edit_var: new value"),
  title: z.string().optional().describe("set_metadata / publish"),
  description: z.string().optional().describe("set_metadata / publish; \"\" clears"),
  icon: z.string().optional().describe("set_metadata: fa: from qkrpc_fa search"),
  expectedEditVersion: z.number().int().optional().describe("set_metadata: from last response"),
  force: z.boolean().optional().describe("set_metadata: ignore editVersion conflict"),
  profile: z.string().optional().describe("move: profileId, name, or scope"),
  row: z.number().int().min(0).optional().describe("move: grid row (with col)"),
  col: z.number().int().min(0).optional().describe("move: grid column (with row)"),
  swap: z.boolean().optional().describe("move: swap with occupant"),
  onNoEmptySlot: z.enum(["ask", "cancel", "createPageAfter"]).optional(),
  onOccupiedSlot: z.enum(["ask", "cancel", "swap"]).optional(),
  note: z.string().optional().describe("publish: release note"),
  tags: z.string().optional().describe("publish: tags"),
  keywords: z.string().optional().describe("publish: keywords"),
  changelog: z.string().optional().describe("publish: changelog"),
  isPublic: z.boolean().optional().describe("publish: public listing"),
  submitReview: z.boolean().optional().describe("publish: submit review"),
});

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
  profileId: z.string().uuid().optional().describe("profile_delete: single profile id"),
  count: z.number().int().min(1).max(20).optional().describe("profile_create: pages to add"),
  afterFirst: z.boolean().optional().describe("profile_create: insert after first page"),
  profileIds: z
    .array(z.string())
    .optional()
    .describe("profile_delete/reorder: profile id list"),
  id: z.string().optional().describe("profile_delete: alias for profileId"),
  scope: z.string().optional().describe("profile_prune: scope filter"),
  exeFile: z.string().optional().describe("profile_prune/process_ensure: exe path"),
  displayName: z.string().optional().describe("process_ensure: virtual process display name"),
  profileNamePrefix: z.string().optional().describe("process_ensure: new profile name prefix"),
  collectSubProgramName: z
    .string()
    .optional()
    .describe("process_ensure: subprogram to collect actions into"),
  moveActions: z.boolean().optional().describe("process_ensure: move matching actions"),
  moveAny: z.boolean().optional().describe("process_ensure: move any action on exe"),
});

type ToolParseResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

function formatZodToolInputError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ") || "Invalid tool input";
}

function parseActionRunToolInput(
  input: z.infer<typeof actionRunSchema>,
): ToolParseResult<QkrpcActionRunToolInput> {
  const normalized = normalizeQkrpcActionInput(input) as z.infer<typeof actionRunSchema>;
  const parsed = actionRunInputSchema.safeParse(normalized);
  if (!parsed.success) {
    return { success: false, message: formatZodToolInputError(parsed.error) };
  }
  return { success: true, data: parsed.data };
}

function parseActionIdToolInput(
  input: z.infer<typeof actionIdSchema>,
): ToolParseResult<QkrpcActionIdToolInput> {
  const normalized = normalizeQkrpcActionInput(input) as z.infer<typeof actionIdSchema>;
  const action = normalized.action as string;
  if (action === "run" || action === "debug" || action === "float") {
    return {
      success: false,
      message: "Use qkrpc_action_run / qkrpc_action_debug / qkrpc_action_float — not qkrpc_action_get.",
    };
  }
  if (action === "replace") {
    return { success: false, message: WORKSPACE_REDIRECT };
  }
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
export type QkrpcActionToolInput = QkrpcActionQueryToolInput & {
  action?:
    | QkrpcActionIdToolInput["action"]
    | QkrpcActionManageToolInput["action"]
    | "list"
    | "search"
    | "run"
    | "debug"
    | "float"
    | "trace"
    | "replace"
    | "patch";
  filter?: "library" | "installed" | "local" | "published";
  program?: Record<string, unknown>;
  patch?: Record<string, unknown>;
  xaction?: Record<string, unknown>;
  expectedEditVersion?: number;
  force?: boolean;
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

/** Replay shim: consolidated-era qkrpc_action_run may pass action/debug/trace on input. */
export function coerceQkrpcActionRunInput(
  input: { id: string; param?: string; wait?: boolean },
  defaultAction: QkrpcActionRunToolInput["action"],
): QkrpcActionRunToolInput {
  const raw = input as Record<string, unknown>;
  const action = typeof raw.action === "string" ? raw.action.trim() : "";
  if (action === "debug" || action === "trace" || raw.trace === true) {
    return { action: "debug", id: input.id, param: input.param };
  }
  if (action === "float") {
    return { action: "float", id: input.id };
  }
  if (action === "run" || !action) {
    return {
      action: defaultAction === "float" ? "float" : defaultAction === "debug" ? "debug" : "run",
      id: input.id,
      param: input.param,
      wait: input.wait,
    };
  }
  return { action: defaultAction, id: input.id, param: input.param, wait: input.wait };
}

export async function executeQkrpcActionRunTool(
  input: QkrpcActionRunToolInput,
): Promise<Record<string, unknown>> {
  switch (input.action) {
    case "float":
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(["action", "float", "--id", input.id]),
      );
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
    default: {
      const _exhaustive: never = input;
      return formatQkrpcResultForAgent(
        qkrpcValidationError(`Unknown run action: ${String(_exhaustive)}`),
      );
    }
  }
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

  const runActions = new Set(["run", "debug", "float", "trace"]);
  if (action && runActions.has(action)) {
    const parsed = parseActionRunToolInput(
      input as z.infer<typeof actionRunSchema>,
    );
    if (!parsed.success) {
      return formatQkrpcResultForAgent(qkrpcValidationError(parsed.message));
    }
    return executeQkrpcActionRunTool(parsed.data);
  }

  if (action === "replace") {
    const replaceInput = input as QkrpcActionToolInput & {
      id: string;
      xaction: Record<string, unknown>;
    };
    const base = ["action", "replace", "--id", replaceInput.id];
    if (replaceInput.expectedEditVersion != null) {
      base.push("--expected-edit-version", String(replaceInput.expectedEditVersion));
    }
    if (replaceInput.force) base.push("--force");
    return formatQkrpcResultForAgent(
      await runQkrpcWithXactionForTool(base, replaceInput.xaction),
    );
  }

  const idActions = new Set([
    "get",
    "edit",
    "edit_var",
    "set_metadata",
    "move",
    "publish",
  ]);
  if (action && idActions.has(action)) {
    const parsed = parseActionIdToolInput(input as z.infer<typeof actionIdSchema>);
    if (!parsed.success) {
      return formatQkrpcResultForAgent(qkrpcValidationError(parsed.message));
    }
    return executeQkrpcActionIdTool(parsed.data);
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
  "Find actions by keyword, scope, or uses:SubName. Use before get/run/edit — not for editing program body. "
  + "Empty query = recent actions. UI renders table — summarize counts only.";

export const QKRPC_ACTION_QUERY_TOOL_DEF = tool({
  description: ACTION_QUERY_DESCRIPTION,
  inputSchema: actionQuerySchema,
  execute: async (input) => executeQkrpcActionQueryTool(input),
});

export const QKRPC_ACTION_GET_TOOL_DEF = tool({
  description:
    "Sync one action from Quicker to .quicker/actions/{id}/ (first time only). "
    + "After qkrpc_action_create skip get — use workspace_program. NOT run — qkrpc_action_run.",
  inputSchema: z.object({
    id: z.string().uuid().describe("Action GUID"),
    returnMode: returnModeSchema
      .optional()
      .describe("full | structure | metadata (default structure)"),
  }),
  execute: async (input) =>
    executeQkrpcActionIdTool({ action: "get", ...input }),
});

export const QKRPC_ACTION_EDIT_TOOL_DEF = tool({
  description: "Open one action in Quicker desktop designer UI.",
  inputSchema: z.object({
    id: z.string().uuid().describe("Action GUID"),
  }),
  execute: async ({ id }) => executeQkrpcActionIdTool({ action: "edit", id }),
});

export const QKRPC_ACTION_EDIT_VAR_TOOL_DEF = tool({
  description: "Set one action variable value in Quicker (not disk edit).",
  inputSchema: z.object({
    id: z.string().describe("Action GUID"),
    var: z.string().describe("Variable key"),
    value: z.string().describe("New value"),
  }),
  execute: async (input) => executeQkrpcActionIdTool({ action: "edit_var", ...input }),
});

export const QKRPC_ACTION_SET_METADATA_TOOL_DEF = tool({
  description:
    "Update action title, description, or icon only. Icon: qkrpc_fa search first.",
  inputSchema: z.object({
    id: z.string().uuid().describe("Action GUID"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description; \"\" clears"),
    icon: z.string().optional().describe("fa: spec from qkrpc_fa"),
    expectedEditVersion: z.number().int().optional(),
    force: z.boolean().optional().describe("Ignore editVersion conflict"),
  }),
  execute: async (input) =>
    executeQkrpcActionIdTool({ action: "set_metadata", ...input }),
});

export const QKRPC_ACTION_MOVE_TOOL_DEF = tool({
  description: "Move one action on the Quicker action grid (profile + row/col).",
  inputSchema: z.object({
    id: z.string().uuid().describe("Action GUID"),
    profile: z.string().describe("profileId, name, or scope"),
    row: z.number().int().min(0).optional(),
    col: z.number().int().min(0).optional(),
    swap: z.boolean().optional().describe("Swap with occupant"),
    onNoEmptySlot: z.enum(["ask", "cancel", "createPageAfter"]).optional(),
    onOccupiedSlot: z.enum(["ask", "cancel", "swap"]).optional(),
  }),
  execute: async (input) => executeQkrpcActionIdTool({ action: "move", ...input }),
});

export const QKRPC_ACTION_PUBLISH_TOOL_DEF = tool({
  description: "Publish/share one action to getquicker.net.",
  inputSchema: z.object({
    id: z.string().uuid().describe("Action GUID"),
    title: z.string().optional(),
    description: z.string().optional(),
    note: z.string().optional().describe("Release note"),
    tags: z.string().optional(),
    keywords: z.string().optional(),
    changelog: z.string().optional(),
    isPublic: z.boolean().optional(),
    submitReview: z.boolean().optional(),
  }),
  execute: async (input) =>
    executeQkrpcActionIdTool({ action: "publish", ...input }),
});

export const QKRPC_ACTION_RUN_TOOL_DEF = tool({
  description:
    "Run one action and wait for completion. NOT debug (qkrpc_action_debug), NOT edit (workspace_program).",
  inputSchema: z.object({
    id: z.string().describe("Action GUID"),
    param: z.string().optional().describe("quicker_in_param"),
    wait: z.boolean().optional().describe("Block until finished"),
  }),
  execute: async (input) =>
    executeQkrpcActionRunTool(coerceQkrpcActionRunInput(input, "run")),
});

export const QKRPC_ACTION_DEBUG_TOOL_DEF = tool({
  description:
    "Debug one action with step trace in side panel — use when step output is needed.",
  inputSchema: z.object({
    id: z.string().describe("Action GUID"),
    param: z.string().optional().describe("quicker_in_param"),
  }),
  execute: async (input) =>
    executeQkrpcActionRunTool(coerceQkrpcActionRunInput(input, "debug")),
});

export const QKRPC_ACTION_FLOAT_TOOL_DEF = tool({
  description: "Float one action popup window in Quicker.",
  inputSchema: z.object({
    id: z.string().describe("Action GUID"),
  }),
  execute: async (input) =>
    executeQkrpcActionRunTool(coerceQkrpcActionRunInput(input, "float")),
});

/** @deprecated Consolidated-era router — legacy replay only. */
export const QKRPC_ACTION_RUN_CONSOLIDATED_TOOL_DEF = tool({
  description: "Deprecated: use qkrpc_action_run / qkrpc_action_debug / qkrpc_action_float.",
  inputSchema: actionRunSchema,
  execute: async (input) => {
    const parsed = parseActionRunToolInput(input);
    if (!parsed.success) {
      return formatQkrpcResultForAgent(qkrpcValidationError(parsed.message));
    }
    return executeQkrpcActionRunTool(parsed.data);
  },
});

/** @deprecated Consolidated-era router — legacy replay only. */
export const QKRPC_ACTION_TOOL_DEF = tool({
  description: "Deprecated: use qkrpc_action_get / edit / set_metadata / move / publish.",
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
    + "Program body schema: qkrpc guide get --topic action-data-schema --json. "
    + "Do not pass layout/profile/process fields. After create, edit steps via workspace_program — do not qkrpc_action_get.",
  inputSchema: actionCreateSchema,
  execute: async (input) => executeQkrpcActionCreateTool(input),
});

export const QKRPC_PROFILE_CREATE_TOOL_DEF = tool({
  description: "Create new action page tabs (profiles) on the global action grid.",
  inputSchema: z.object({
    count: z.number().int().min(1).max(20).optional().describe("Pages to add"),
    afterFirst: z.boolean().optional().describe("Insert after first page"),
  }),
  execute: async (input) =>
    executeQkrpcActionManageTool({ action: "profile_create", ...input }),
});

export const QKRPC_PROFILE_DELETE_TOOL_DEF = tool({
  description: "Delete one or more action page tabs (profiles).",
  inputSchema: z.object({
    profileIds: z.array(z.string()).optional(),
    profileId: z.string().uuid().optional(),
    id: z.string().optional().describe("Alias for profileId"),
  }),
  execute: async (input) =>
    executeQkrpcActionManageTool({ action: "profile_delete", ...input }),
});

export const QKRPC_PROFILE_PRUNE_TOOL_DEF = tool({
  description: "Prune empty action pages for a scope or exe.",
  inputSchema: z.object({
    scope: z.string().optional(),
    exeFile: z.string().optional().describe("Exe path (alternative to scope)"),
  }),
  execute: async (input) =>
    executeQkrpcActionManageTool({ action: "profile_prune", ...input }),
});

export const QKRPC_PROFILE_REORDER_TOOL_DEF = tool({
  description: "Reorder global action page tabs.",
  inputSchema: z.object({
    profileIds: z.array(z.string()).min(1).describe("Ordered profile ids"),
  }),
  execute: async (input) =>
    executeQkrpcActionManageTool({ action: "profile_reorder", ...input }),
});

export const QKRPC_PROCESS_ENSURE_TOOL_DEF = tool({
  description: "Ensure virtual process profiles exist for an exe (action page layout).",
  inputSchema: z.object({
    exeFile: z.string().describe("Executable path"),
    displayName: z.string().describe("Virtual process display name"),
    profileNamePrefix: z.string().describe("New profile name prefix"),
    collectSubProgramName: z.string().optional(),
    moveActions: z.boolean().optional(),
    moveAny: z.boolean().optional(),
  }),
  execute: async (input) =>
    executeQkrpcActionManageTool({ action: "process_ensure", ...input }),
});

/** @deprecated Consolidated-era router — legacy replay only. */
export const QKRPC_ACTION_MANAGE_TOOL_DEF = tool({
  description: "Deprecated: use qkrpc_profile_* / qkrpc_process_ensure.",
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
  QKRPC_ACTION_DEBUG_TOOL,
  QKRPC_ACTION_EDIT_TOOL,
  QKRPC_ACTION_EDIT_VAR_TOOL,
  QKRPC_ACTION_FLOAT_TOOL,
  QKRPC_ACTION_GET_TOOL,
  QKRPC_ACTION_MANAGE_TOOL,
  QKRPC_ACTION_MOVE_TOOL,
  QKRPC_ACTION_PUBLISH_TOOL,
  QKRPC_ACTION_QUERY_TOOL,
  QKRPC_ACTION_RUN_TOOL,
  QKRPC_ACTION_SET_METADATA_TOOL,
  QKRPC_ACTION_TOOL,
  QKRPC_PROCESS_ENSURE_TOOL,
  QKRPC_PROFILE_CREATE_TOOL,
  QKRPC_PROFILE_DELETE_TOOL,
  QKRPC_PROFILE_PRUNE_TOOL,
  QKRPC_PROFILE_REORDER_TOOL,
};
