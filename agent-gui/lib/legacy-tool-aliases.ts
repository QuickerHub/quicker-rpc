import { tool } from "ai";
import { z } from "zod";
import {
  DOCS_GET_REFERENCE_TOOL,
  DOCS_GET_TOOL,
  DOCS_INDEX_TOOL,
  DOCS_SEARCH_TOOL,
} from "@/lib/docs-tool";
import {
  executeDocsTool,
} from "@/lib/docs-tool.server";
import {
  executeQuickerSettingsTool,
  QKRPC_SETTINGS_GET_TOOL,
  QKRPC_SETTINGS_LIST_TOOL,
  QKRPC_SETTINGS_OPEN_TOOL,
  QKRPC_SETTINGS_PAGES_TOOL,
  QKRPC_SETTINGS_SEARCH_TOOL,
  QKRPC_SETTINGS_SET_TOOL,
} from "@/lib/qkrpc-settings-tool";
import {
  executeQkrpcFaTool,
  QKRPC_FA_RESOLVE_TOOL,
  QKRPC_FA_SEARCH_TOOL,
} from "@/lib/qkrpc-fa-tool";
import {
  executeQkrpcActionIdTool,
  executeQkrpcActionManageTool,
  executeQkrpcActionQueryTool,
} from "@/lib/qkrpc-action-tool.server";
import {
  executeQkrpcSubprogramIdTool,
  executeQkrpcSubprogramManageTool,
  executeQkrpcSubprogramQueryTool,
  executeQkrpcSubprogramTool,
} from "@/lib/qkrpc-subprogram-tool.server";
import { executeWorkspaceProgramTool } from "@/lib/workspace-program-tool.server";
import { workspaceProgramIdSchema } from "@/lib/workspace-program-schema";

const returnModeSchema = z.enum(["full", "structure", "metadata"]);

const workspaceReadSliceSchema = {
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(200_000).optional(),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  maxLines: z.number().int().min(1).max(2_000).optional(),
};

/**
 * Deprecated tool ids kept for tool-test replay, direct execute API, and old chat threads.
 * Not registered in QKRPC_TOOL_REGISTRY — new sessions use consolidated tools only.
 */
export const legacyQuickerToolAliases = {
  [DOCS_GET_TOOL]: tool({
    description: "Deprecated: use docs({ action: \"get\", topic })",
    inputSchema: z.object({ topic: z.string() }),
    execute: async ({ topic }) => executeDocsTool({ action: "get", topic }),
  }),

  [DOCS_GET_REFERENCE_TOOL]: tool({
    description: "Deprecated: use docs({ action: \"get\", topic, reference })",
    inputSchema: z.object({ topic: z.string(), file: z.string() }),
    execute: async ({ topic, file }) =>
      executeDocsTool({ action: "get", topic, reference: file }),
  }),

  [DOCS_SEARCH_TOOL]: tool({
    description: "Deprecated: use docs({ action: \"search\", query })",
    inputSchema: z.object({
      query: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    execute: async ({ query, limit }) =>
      executeDocsTool({ action: "search", query, limit }),
  }),

  [DOCS_INDEX_TOOL]: tool({
    description: "Deprecated: use docs({ action: \"index\" })",
    inputSchema: z.object({}),
    execute: async () => executeDocsTool({ action: "index" }),
  }),

  [QKRPC_SETTINGS_SEARCH_TOOL]: tool({
    description: "Deprecated: use quicker_settings({ action: \"search\", query })",
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async ({ query, limit }) =>
      executeQuickerSettingsTool({ action: "search", query, limit }),
  }),

  [QKRPC_SETTINGS_LIST_TOOL]: tool({
    description: "Deprecated: use quicker_settings({ action: \"list\" })",
    inputSchema: z.object({
      scope: z
        .enum(["userSettings", "userPreference", "globalSettings", "exeSettings"])
        .optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    execute: async ({ scope, limit }) =>
      executeQuickerSettingsTool({ action: "list", scope, limit }),
  }),

  [QKRPC_SETTINGS_GET_TOOL]: tool({
    description: "Deprecated: use quicker_settings({ action: \"get\", key })",
    inputSchema: z.object({ key: z.string() }),
    execute: async ({ key }) =>
      executeQuickerSettingsTool({ action: "get", key }),
  }),

  [QKRPC_SETTINGS_SET_TOOL]: tool({
    description: "Deprecated: use quicker_settings({ action: \"set\", key, value })",
    inputSchema: z.object({ key: z.string(), value: z.string() }),
    execute: async ({ key, value }) =>
      executeQuickerSettingsTool({ action: "set", key, value }),
  }),

  [QKRPC_SETTINGS_PAGES_TOOL]: tool({
    description: "Deprecated: use quicker_settings({ action: \"pages\" })",
    inputSchema: z.object({}),
    execute: async () => executeQuickerSettingsTool({ action: "pages" }),
  }),

  [QKRPC_SETTINGS_OPEN_TOOL]: tool({
    description: "Deprecated: use quicker_settings({ action: \"open\", page })",
    inputSchema: z.object({ page: z.string(), exe: z.string().optional() }),
    execute: async ({ page, exe }) =>
      executeQuickerSettingsTool({ action: "open", page, exe }),
  }),

  [QKRPC_FA_SEARCH_TOOL]: tool({
    description: "Deprecated: use qkrpc_fa({ action: \"search\" })",
    inputSchema: z.object({
      query: z.string().optional(),
      limit: z.number().int().min(1).max(80).optional(),
      expand: z.boolean().optional(),
    }),
    execute: async ({ query, limit, expand }) =>
      executeQkrpcFaTool({ action: "search", query, limit, expand }),
  }),

  [QKRPC_FA_RESOLVE_TOOL]: tool({
    description: "Deprecated: use qkrpc_fa({ action: \"resolve\" })",
    inputSchema: z.object({
      spec: z.string().optional(),
      specs: z.array(z.string()).optional(),
    }),
    execute: async ({ spec, specs }) =>
      executeQkrpcFaTool({ action: "resolve", spec, specs }),
  }),

  qkrpc_action_update: tool({
    description: "Deprecated: use qkrpc_action({ action: \"publish\", changelog })",
    inputSchema: z.object({
      id: z.string().uuid(),
      changelog: z.string().optional(),
    }),
    execute: async ({ id, changelog }) =>
      executeQkrpcActionIdTool({ action: "publish", id, changelog }),
  }),

  qkrpc_action_patch: tool({
    description: "Deprecated: use workspace_program({ action: \"patch\" })",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      force: z.boolean().optional(),
    }),
    execute: async (input) =>
      executeWorkspaceProgramTool({ action: "patch", ...input }),
  }),

  qkrpc_action_list: tool({
    description: "Deprecated: use qkrpc_action_query({ query })",
    inputSchema: z.object({
      query: z.string().optional(),
      scope: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      sort: z.enum(["relevance", "lastEdit", "title"]).optional(),
    }),
    execute: async (input) => executeQkrpcActionQueryTool(input),
  }),

  qkrpc_action_search: tool({
    description: "Deprecated: use qkrpc_action_query({ query })",
    inputSchema: z.object({
      query: z.string(),
      scope: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async (input) => executeQkrpcActionQueryTool(input),
  }),

  qkrpc_action_get: tool({
    description: "Deprecated: use qkrpc_action({ action: \"get\", id })",
    inputSchema: z.object({
      id: z.string().uuid(),
      returnMode: returnModeSchema.optional(),
    }),
    execute: async ({ id, returnMode }) =>
      executeQkrpcActionIdTool({ action: "get", id, returnMode }),
  }),

  qkrpc_action_create: tool({
    description: "Deprecated: use qkrpc_action_manage({ action: \"create\" })",
    inputSchema: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      icon: z.string().optional(),
      profileId: z.string().uuid().optional(),
    }),
    execute: async (input) =>
      executeQkrpcActionManageTool({ action: "create", ...input }),
  }),

  qkrpc_action_replace: tool({
    description: "Deprecated: use qkrpc_action({ action: \"replace\" })",
    inputSchema: z.object({
      id: z.string().uuid(),
      xaction: z.record(z.unknown()),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async ({ id, xaction, expectedEditVersion, force }) =>
      executeQkrpcActionIdTool({
        action: "replace",
        id,
        xaction,
        expectedEditVersion,
        force,
      }),
  }),

  qkrpc_action_publish: tool({
    description: "Deprecated: use qkrpc_action({ action: \"publish\" })",
    inputSchema: z.object({
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
    execute: async (input) =>
      executeQkrpcActionIdTool({ action: "publish", ...input }),
  }),

  qkrpc_action_float: tool({
    description: "Deprecated: use qkrpc_action({ action: \"float\", id })",
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => executeQkrpcActionIdTool({ action: "float", id }),
  }),

  qkrpc_action_edit: tool({
    description: "Deprecated: use qkrpc_action({ action: \"edit\", id })",
    inputSchema: z.object({ id: z.string().uuid() }),
    execute: async ({ id }) => executeQkrpcActionIdTool({ action: "edit", id }),
  }),

  qkrpc_action_edit_var: tool({
    description: "Deprecated: use qkrpc_action({ action: \"edit_var\" })",
    inputSchema: z.object({
      id: z.string(),
      var: z.string(),
      value: z.string(),
    }),
    execute: async ({ id, var: variableKey, value }) =>
      executeQkrpcActionIdTool({
        action: "edit_var",
        id,
        var: variableKey,
        value,
      }),
  }),

  qkrpc_action_set_metadata: tool({
    description: "Deprecated: use qkrpc_action({ action: \"set_metadata\" })",
    inputSchema: z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      description: z.string().optional(),
      icon: z.string().optional(),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async (input) =>
      executeQkrpcActionIdTool({ action: "set_metadata", ...input }),
  }),

  qkrpc_action_run: tool({
    description: "Deprecated: use qkrpc_action({ action: \"run\" })",
    inputSchema: z.object({
      id: z.string(),
      param: z.string().optional(),
      wait: z.boolean().optional(),
      debug: z.boolean().optional(),
    }),
    execute: async (input) => executeQkrpcActionIdTool({ action: "run", ...input }),
  }),

  qkrpc_action_move: tool({
    description: "Deprecated: use qkrpc_action({ action: \"move\" })",
    inputSchema: z.object({
      id: z.string().uuid(),
      profile: z.string(),
      row: z.number().int().min(0).optional(),
      col: z.number().int().min(0).optional(),
      swap: z.boolean().optional(),
      onNoEmptySlot: z.enum(["ask", "cancel", "createPageAfter"]).optional(),
      onOccupiedSlot: z.enum(["ask", "cancel", "swap"]).optional(),
    }),
    execute: async (input) => executeQkrpcActionIdTool({ action: "move", ...input }),
  }),

  qkrpc_profile_create: tool({
    description: "Deprecated: use qkrpc_action_manage({ action: \"profile_create\" })",
    inputSchema: z.object({
      count: z.number().int().min(1).max(20).optional(),
      afterFirst: z.boolean().optional(),
    }),
    execute: async (input) =>
      executeQkrpcActionManageTool({ action: "profile_create", ...input }),
  }),

  qkrpc_profile_delete: tool({
    description: "Deprecated: use qkrpc_action_manage({ action: \"profile_delete\" })",
    inputSchema: z.object({
      profileId: z.string().optional(),
      profileIds: z.array(z.string()).min(1).optional(),
    }),
    execute: async ({ profileId, profileIds }) =>
      executeQkrpcActionManageTool({
        action: "profile_delete",
        id: profileId,
        profileIds,
      }),
  }),

  qkrpc_profile_reorder: tool({
    description: "Deprecated: use qkrpc_action_manage({ action: \"profile_reorder\" })",
    inputSchema: z.object({
      profileIds: z.array(z.string().uuid()).min(1),
    }),
    execute: async ({ profileIds }) =>
      executeQkrpcActionManageTool({ action: "profile_reorder", profileIds }),
  }),

  qkrpc_process_ensure: tool({
    description: "Deprecated: use qkrpc_action_manage({ action: \"process_ensure\" })",
    inputSchema: z.object({
      exeFile: z.string(),
      displayName: z.string(),
      profileNamePrefix: z.string(),
      collectSubProgramName: z.string().optional(),
      moveActions: z.boolean().optional(),
      moveAny: z.boolean().optional(),
    }),
    execute: async (input) =>
      executeQkrpcActionManageTool({ action: "process_ensure", ...input }),
  }),

  qkrpc_subprogram_list: tool({
    description: "Deprecated: use qkrpc_subprogram_query({ query })",
    inputSchema: z.object({
      query: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async (input) => executeQkrpcSubprogramQueryTool(input),
  }),

  qkrpc_subprogram_search: tool({
    description: "Deprecated: use qkrpc_subprogram_query({ query })",
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async (input) => executeQkrpcSubprogramQueryTool(input),
  }),

  qkrpc_subprogram_get: tool({
    description: "Deprecated: use qkrpc_subprogram({ action: \"get\", id })",
    inputSchema: z.object({
      id: z.string(),
      returnMode: returnModeSchema.optional(),
    }),
    execute: async ({ id, returnMode }) =>
      executeQkrpcSubprogramIdTool({ action: "get", id, returnMode }),
  }),

  qkrpc_subprogram_create: tool({
    description: "Deprecated: use qkrpc_subprogram_manage({ action: \"create\", name })",
    inputSchema: z.object({
      name: z.string(),
      description: z.string().optional(),
      icon: z.string().optional(),
    }),
    execute: async (input) =>
      executeQkrpcSubprogramManageTool({ action: "create", ...input }),
  }),

  qkrpc_subprogram_patch: tool({
    description: "Deprecated: use qkrpc_subprogram({ action: \"patch\" })",
    inputSchema: z.object({
      id: z.string(),
      patch: z.record(z.unknown()),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async ({ id, patch, expectedEditVersion, force }) =>
      executeQkrpcSubprogramIdTool({
        action: "patch",
        id,
        patch,
        expectedEditVersion,
        force,
      }),
  }),

  qkrpc_subprogram_replace: tool({
    description: "Deprecated: use qkrpc_subprogram({ action: \"replace\" })",
    inputSchema: z.object({
      id: z.string(),
      program: z.record(z.unknown()),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async ({ id, program, expectedEditVersion, force }) =>
      executeQkrpcSubprogramIdTool({
        action: "replace",
        id,
        program,
        expectedEditVersion,
        force,
      }),
  }),

  qkrpc_subprogram_export: tool({
    description: "Deprecated: use qkrpc_subprogram({ action: \"export\" })",
    inputSchema: z.object({ id: z.string(), dir: z.string() }),
    execute: async ({ id, dir }) =>
      executeQkrpcSubprogramIdTool({ action: "export", id, dir }),
  }),

  qkrpc_subprogram_import: tool({
    description: "Deprecated: use qkrpc_subprogram({ action: \"import\", dir })",
    inputSchema: z.object({
      dir: z.string(),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async (input) =>
      executeQkrpcSubprogramIdTool({ action: "import", ...input }),
  }),

  qkrpc_subprogram_edit: tool({
    description: "Deprecated: use qkrpc_subprogram({ action: \"edit\", id })",
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => executeQkrpcSubprogramIdTool({ action: "edit", id }),
  }),

  qkrpc_subprogram_edit_var: tool({
    description: "Deprecated: use qkrpc_subprogram({ action: \"edit_var\" })",
    inputSchema: z.object({
      id: z.string(),
      var: z.string(),
      value: z.string(),
    }),
    execute: async ({ id, var: variableKey, value }) =>
      executeQkrpcSubprogramIdTool({
        action: "edit_var",
        id,
        var: variableKey,
        value,
      }),
  }),

  workspace_action_projects: tool({
    description: "Deprecated: use workspace_program({ action: \"projects_list\" })",
    inputSchema: z.object({
      target: z.enum(["action", "global_subprogram", "all"]).optional(),
    }),
    execute: async ({ target }) =>
      executeWorkspaceProgramTool({
        action: "projects_list",
        target: target ?? "all",
      }),
  }),

  workspace_program_patch: tool({
    description: "Deprecated: use workspace_program({ action: \"patch\" })",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      force: z.boolean().optional(),
    }),
    execute: async (input) =>
      executeWorkspaceProgramTool({ action: "patch", ...input }),
  }),

  workspace_program_diagnostics: tool({
    description: "Deprecated: use workspace_program({ action: \"diagnostics\" })",
    inputSchema: z.object({
      target: z.enum(["action", "global_subprogram", "embedded_subprogram"]),
      id: z.string(),
      subProgramId: z.string().optional(),
      editVersion: z.number().int().optional(),
      waitMs: z.number().int().min(0).max(120_000).optional(),
    }),
    execute: async (input) =>
      executeWorkspaceProgramTool({ action: "diagnostics", ...input }),
  }),

  workspace_action_read_data: tool({
    description: "Deprecated: use workspace_program({ action: \"read_data\" })",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      mode: z.enum(["content", "summary"]).optional(),
      ...workspaceReadSliceSchema,
    }),
    execute: async (input) =>
      executeWorkspaceProgramTool({ action: "read_data", ...input }),
  }),

  workspace_action_write_data: tool({
    description: "Deprecated: use workspace_program({ action: \"write_data\" })",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      content: z.string(),
    }),
    execute: async (input) =>
      executeWorkspaceProgramTool({ action: "write_data", ...input }),
  }),

  workspace_action_edit_data: tool({
    description: "Deprecated: use workspace_program({ action: \"edit_data\" })",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      oldString: z.string().min(1),
      newString: z.string(),
      replaceAll: z.boolean().optional(),
    }),
    execute: async (input) =>
      executeWorkspaceProgramTool({ action: "edit_data", ...input }),
  }),

  workspace_action_file_read: tool({
    description: "Deprecated: use workspace_program({ action: \"file_read\" })",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      path: z.string(),
      ...workspaceReadSliceSchema,
    }),
    execute: async (input) =>
      executeWorkspaceProgramTool({ action: "file_read", ...input }),
  }),

  workspace_action_file_write: tool({
    description: "Deprecated: use workspace_program({ action: \"file_write\" })",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      path: z.string(),
      content: z.string(),
    }),
    execute: async (input) =>
      executeWorkspaceProgramTool({ action: "file_write", ...input }),
  }),

  workspace_action_file_edit: tool({
    description: "Deprecated: use workspace_program({ action: \"file_edit\" })",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      path: z.string(),
      oldString: z.string().min(1),
      newString: z.string(),
      replaceAll: z.boolean().optional(),
    }),
    execute: async (input) =>
      executeWorkspaceProgramTool({ action: "file_edit", ...input }),
  }),

  workspace_action_file_info: tool({
    description: "Deprecated: use workspace_program({ action: \"file_info\" })",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      path: z.string(),
    }),
    execute: async (input) =>
      executeWorkspaceProgramTool({ action: "file_info", ...input }),
  }),

  workspace_action_file_search: tool({
    description: "Deprecated: use workspace_program({ action: \"file_search\" })",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      path: z.string().optional(),
      query: z.string().min(1),
      maxMatches: z.number().int().min(1).max(50).optional(),
      caseInsensitive: z.boolean().optional(),
    }),
    execute: async (input) =>
      executeWorkspaceProgramTool({ action: "file_search", ...input }),
  }),
};
