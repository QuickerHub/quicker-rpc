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
  QKRPC_ACTION_MANAGE_TOOL_DEF,
  QKRPC_ACTION_RUN_CONSOLIDATED_TOOL_DEF,
  QKRPC_ACTION_TOOL_DEF,
  executeQkrpcActionIdTool,
  executeQkrpcActionManageTool,
  executeQkrpcActionQueryTool,
  executeQkrpcActionRunTool,
  executeQkrpcActionTool,
  type QkrpcActionToolInput,
} from "@/lib/qkrpc-action-tool.server";
import { QKRPC_ACTION_MANAGE_TOOL, QKRPC_ACTION_TOOL } from "@/lib/qkrpc-action-tool";
import {
  QKRPC_SUBPROGRAM_MANAGE_TOOL_DEF,
  QKRPC_SUBPROGRAM_TOOL_DEF,
  executeQkrpcSubprogramIdTool,
  executeQkrpcSubprogramManageTool,
  executeQkrpcSubprogramQueryTool,
  executeQkrpcSubprogramTool,
  type QkrpcSubprogramToolInput,
} from "@/lib/qkrpc-subprogram-tool.server";
import {
  QKRPC_SUBPROGRAM_MANAGE_TOOL,
  QKRPC_SUBPROGRAM_TOOL,
} from "@/lib/qkrpc-subprogram-tool";
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

  [QKRPC_ACTION_TOOL]: QKRPC_ACTION_TOOL_DEF,
  [QKRPC_ACTION_MANAGE_TOOL]: QKRPC_ACTION_MANAGE_TOOL_DEF,
  qkrpc_action_run_consolidated: QKRPC_ACTION_RUN_CONSOLIDATED_TOOL_DEF,

  qkrpc_action_update: tool({
    description: "Deprecated: use qkrpc_action_publish({ changelog })",
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

  qkrpc_action_replace: tool({
    description: "Deprecated: use workspace_program({ action: \"patch\", target: \"action\", id })",
    inputSchema: z.object({
      id: z.string().uuid(),
      xaction: z.record(z.unknown()),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async ({ id, xaction, expectedEditVersion, force }) =>
      executeQkrpcActionTool({
        action: "replace",
        id,
        xaction,
        expectedEditVersion,
        force,
      } as QkrpcActionToolInput),
  }),

  [QKRPC_SUBPROGRAM_TOOL]: QKRPC_SUBPROGRAM_TOOL_DEF,
  [QKRPC_SUBPROGRAM_MANAGE_TOOL]: QKRPC_SUBPROGRAM_MANAGE_TOOL_DEF,

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

  qkrpc_subprogram_edit_var: tool({
    description:
      "Hidden: prefer workspace_program edit_data (target=global_subprogram) for variable edits.",
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

  qkrpc_subprogram_patch: tool({
    description:
      "Deprecated: use workspace_program({ action: \"patch\", target: \"global_subprogram\", id })",
    inputSchema: z.object({
      id: z.string(),
      patch: z.record(z.unknown()),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async ({ id, patch, expectedEditVersion, force }) =>
      executeQkrpcSubprogramTool({
        action: "patch",
        id,
        patch,
        expectedEditVersion,
        force,
      } as QkrpcSubprogramToolInput),
  }),

  qkrpc_subprogram_replace: tool({
    description:
      "Deprecated: use workspace_program({ action: \"patch\", target: \"global_subprogram\", id })",
    inputSchema: z.object({
      id: z.string(),
      program: z.record(z.unknown()),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async ({ id, program, expectedEditVersion, force }) =>
      executeQkrpcSubprogramTool({
        action: "replace",
        id,
        program,
        expectedEditVersion,
        force,
      } as QkrpcSubprogramToolInput),
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
