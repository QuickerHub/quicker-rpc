import { tool } from "ai";
import { z } from "zod";
import { registerLocalActionProject } from "@/lib/action-scope";
import {
  augmentActionGetWithWorkspace,
  bootstrapActionProjectForCreate,
  buildWorkspaceProjectSummary,
  parseQkrpcPayload,
  programHasBodyFromGetPayload,
  syncActionToWorkspace,
} from "@/lib/action-project-workflow";
import { QKRPC_ACTION_TOOL } from "@/lib/qkrpc-action-tool";
import {
  formatQkrpcResultForAgent,
  runQkrpcForTool,
  runQkrpcWithPatchFileForTool,
  runQkrpcWithProgramForTool,
  runQkrpcWithXactionForTool,
} from "@/lib/qkrpc";
import { formatLocalToolResult } from "@/lib/tool-result";

const returnModeSchema = z.enum(["full", "structure", "metadata"]);

const actionSchema = z.enum([
  "list",
  "search",
  "get",
  "create",
  "replace",
  "publish",
  "set_metadata",
  "float",
  "edit",
  "edit_var",
  "run",
  "move",
  "profile_create",
  "profile_delete",
  "profile_reorder",
  "process_ensure",
]);

export type QkrpcActionToolInput = {
  action: z.infer<typeof actionSchema>;
  query?: string;
  scope?: string;
  limit?: number;
  sort?: "relevance" | "lastEdit" | "title";
  id?: string;
  returnMode?: z.infer<typeof returnModeSchema>;
  title?: string;
  description?: string;
  icon?: string;
  profileId?: string;
  xaction?: Record<string, unknown>;
  program?: Record<string, unknown>;
  patch?: Record<string, unknown>;
  expectedEditVersion?: number;
  force?: boolean;
  note?: string;
  tags?: string;
  keywords?: string;
  changelog?: string;
  isPublic?: boolean;
  submitReview?: boolean;
  var?: string;
  value?: string;
  param?: string;
  wait?: boolean;
  debug?: boolean;
  profile?: string;
  row?: number;
  col?: number;
  swap?: boolean;
  onNoEmptySlot?: "ask" | "cancel" | "createPageAfter";
  onOccupiedSlot?: "ask" | "cancel" | "swap";
  count?: number;
  afterFirst?: boolean;
  profileIds?: string[];
  profileId?: string;
  exeFile?: string;
  displayName?: string;
  profileNamePrefix?: string;
  collectSubProgramName?: string;
  moveActions?: boolean;
  moveAny?: boolean;
};

export async function executeQkrpcActionTool(
  input: QkrpcActionToolInput,
): Promise<Record<string, unknown>> {
  switch (input.action) {
    case "list": {
      const args = ["action", "list"];
      if (input.query) args.push("--query", input.query);
      if (input.scope) args.push("--scope", input.scope);
      if (input.limit != null) args.push("--limit", String(input.limit));
      if (input.sort) args.push("--sort", input.sort);
      else if (!input.query?.trim()) args.push("--sort", "lastEdit");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "search": {
      if (!input.query?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "query is required for search",
        });
      }
      const args = ["action", "search", "--query", input.query];
      if (input.scope) args.push("--scope", input.scope);
      if (input.limit != null) args.push("--limit", String(input.limit));
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "get": {
      if (!input.id?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id is required for get",
        });
      }
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
    case "replace": {
      if (!input.id?.trim() || !input.xaction) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id and xaction are required for replace",
        });
      }
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
      if (!input.id?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id is required for publish",
        });
      }
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
    case "float": {
      if (!input.id?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id is required for float",
        });
      }
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(["action", "float", "--id", input.id]),
      );
    }
    case "edit": {
      if (!input.id?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id is required for edit",
        });
      }
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(["action", "edit", "--id", input.id]),
      );
    }
    case "edit_var": {
      if (!input.id?.trim() || !input.var || input.value == null) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id, var, and value are required for edit_var",
        });
      }
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
    }
    case "set_metadata": {
      if (!input.id?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id is required for set_metadata",
        });
      }
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
    case "run": {
      if (!input.id?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id is required for run",
        });
      }
      const args = ["action", "run", "--id", input.id];
      if (input.param) args.push("--param", input.param);
      if (input.wait) args.push("--wait");
      if (input.debug) args.push("--debug");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "move": {
      if (!input.id?.trim() || !input.profile?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "id and profile are required for move",
        });
      }
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
    case "profile_reorder": {
      if (!input.profileIds?.length) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "profileIds is required for profile_reorder",
        });
      }
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
      if (
        !input.exeFile?.trim()
        || !input.displayName?.trim()
        || !input.profileNamePrefix?.trim()
      ) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "exeFile, displayName, and profileNamePrefix are required",
        });
      }
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
      return formatQkrpcResultForAgent({
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: `Unknown action: ${String((input as { action?: string }).action)}`,
      });
  }
}

export const QKRPC_ACTION_TOOL_DEF = tool({
  description:
    "Quicker local actions: list/search/get/create/replace/publish/set_metadata/float/edit/edit_var/run/move; "
    + "global profile tabs (profile_create/delete/reorder); virtual process pages (process_ensure). "
    + "list/search: UI renders the table — summarize only, no markdown table. "
    + "get syncs disk when action has steps/variables. create bootstraps .quicker/actions/{id}/ — no follow-up get. "
    + "Disk editing: workspace_program. Destructive delete: qkrpc_action_delete.",
  inputSchema: z.object({
    action: actionSchema,
    query: z.string().optional(),
    scope: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    sort: z.enum(["relevance", "lastEdit", "title"]).optional(),
    id: z.string().optional(),
    returnMode: returnModeSchema.optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    profileId: z.string().uuid().optional(),
    xaction: z.record(z.unknown()).optional(),
    expectedEditVersion: z.number().int().optional(),
    force: z.boolean().optional(),
    note: z.string().optional(),
    tags: z.string().optional(),
    keywords: z.string().optional(),
    changelog: z.string().optional(),
    isPublic: z.boolean().optional(),
    submitReview: z.boolean().optional(),
    var: z.string().optional(),
    value: z.string().optional(),
    param: z.string().optional(),
    wait: z.boolean().optional(),
    debug: z.boolean().optional(),
    profile: z.string().optional(),
    row: z.number().int().min(0).optional(),
    col: z.number().int().min(0).optional(),
    swap: z.boolean().optional(),
    onNoEmptySlot: z.enum(["ask", "cancel", "createPageAfter"]).optional(),
    onOccupiedSlot: z.enum(["ask", "cancel", "swap"]).optional(),
    count: z.number().int().min(1).max(20).optional(),
    afterFirst: z.boolean().optional(),
    profileIds: z.array(z.string()).optional(),
    profileId: z.string().optional(),
    exeFile: z.string().optional(),
    displayName: z.string().optional(),
    profileNamePrefix: z.string().optional(),
    collectSubProgramName: z.string().optional(),
    moveActions: z.boolean().optional(),
    moveAny: z.boolean().optional(),
  }),
  execute: async (input) => executeQkrpcActionTool(input),
});

export { QKRPC_ACTION_TOOL };
