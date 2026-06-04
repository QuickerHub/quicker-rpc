import { tool } from "ai";
import { z } from "zod";
import {
  getActionAuthoringDoc,
  getActionAuthoringReference,
  listActionAuthoringTopics,
  searchActionAuthoringDocs,
} from "@/lib/action-authoring-docs";
import {
  DOCS_GET_TOOL,
  DOCS_GET_REFERENCE_TOOL,
  DOCS_INDEX_TOOL,
  DOCS_SEARCH_TOOL,
} from "@/lib/docs-tool";
import { formatLocalToolResult } from "@/lib/tool-result";
import { registerLocalActionProject } from "@/lib/action-scope";
import {
  augmentActionGetWithWorkspace,
  bootstrapActionProjectForCreate,
  buildWorkspaceProjectSummary,
  parseQkrpcPayload,
  programHasBodyFromGetPayload,
  syncActionToWorkspace,
} from "@/lib/action-project-workflow";
import { DEFAULT_READ_CHARS } from "@/lib/workspace-fs";
import {
  formatQkrpcResultForAgent,
  runQkrpcForTool,
  runQkrpcWithPatchFileForTool,
  runQkrpcWithProgramForTool,
  runQkrpcWithXactionForTool,
} from "@/lib/qkrpc";
import { LLM_SETTINGS_TOOL, LLM_SETTINGS_TOOL_DEF } from "@/lib/llm-settings-tool";
import { DEV_FRONTEND_CHECK_TOOL, DEV_FRONTEND_CHECK_TOOL_DEF } from "@/lib/dev-frontend-check-tool";
import {
  WORKSPACE_PROGRAM_DIAGNOSTICS_TOOL,
  workspaceProgramDiagnosticsTool,
} from "@/lib/workspace-program-diagnostics-tool.server";
import { SHELL_EXEC_TOOL, SHELL_EXEC_TOOL_DEF } from "@/lib/shell-tool";
import {
  SET_THREAD_TITLE_TOOL,
  SET_THREAD_TITLE_TOOL_DEF,
} from "@/lib/set-thread-title-tool";
import { workspaceProgramIdSchema } from "@/lib/workspace-program-schema";
import {
  executeWorkspaceProgramEditData,
  executeWorkspaceProgramFileEdit,
  executeWorkspaceProgramFileInfo,
  executeWorkspaceProgramFileRead,
  executeWorkspaceProgramFileSearch,
  executeWorkspaceProgramFileWrite,
  executeWorkspaceProgramPatch,
  executeWorkspaceProgramProjects,
  executeWorkspaceProgramReadData,
  executeWorkspaceProgramWriteData,
} from "@/lib/workspace-program-tools.server";

const returnModeSchema = z.enum(["full", "structure", "metadata"]);

/** Partial read for large UTF-8 files (chars or 1-based lines). */
const workspaceReadSliceSchema = {
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(`UTF-16 char offset (default 0). Prefer startLine for scripts.`),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200_000)
    .optional()
    .describe(`Max chars when using offset (default ${DEFAULT_READ_CHARS}).`),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based start line (preferred for large files)."),
  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based inclusive end line (with startLine)."),
  maxLines: z
    .number()
    .int()
    .min(1)
    .max(2_000)
    .optional()
    .describe("Max lines when using startLine (default 400)."),
};

export const quickerTools = {
  [SET_THREAD_TITLE_TOOL]: SET_THREAD_TITLE_TOOL_DEF,
  [SHELL_EXEC_TOOL]: SHELL_EXEC_TOOL_DEF,
  [LLM_SETTINGS_TOOL]: LLM_SETTINGS_TOOL_DEF,
  [DEV_FRONTEND_CHECK_TOOL]: DEV_FRONTEND_CHECK_TOOL_DEF,
  [WORKSPACE_PROGRAM_DIAGNOSTICS_TOOL]: workspaceProgramDiagnosticsTool,
  [DOCS_GET_TOOL]: tool({
    description:
      'Read the local authoring guide by topic id (single skill; start with "authoring-workflow" or "overview").',
    inputSchema: z.object({
      topic: z.string().describe("Guide topic id"),
    }),
    execute: async ({ topic }) => {
      const result = await getActionAuthoringDoc(topic);
      if (!result.ok) {
        return formatLocalToolResult(
          {
            action: "docs-get",
            errorMessage: result.error,
            availableTopics: result.availableTopics,
          },
          false,
          result.error,
        );
      }
      return formatLocalToolResult({
        action: "docs-get",
        success: true,
        topic: result.doc.topic,
        title: result.doc.title,
        description: result.doc.description,
        markdown: result.doc.markdown,
      });
    },
  }),

  [DOCS_SEARCH_TOOL]: tool({
    description:
      "Search local authoring guide topics by keyword (single skill catalog, no qkrpc).",
    inputSchema: z.object({
      query: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    execute: async ({ query, limit }) => {
      const search = await searchActionAuthoringDocs(query, limit ?? 10);
      return formatLocalToolResult({
        action: "docs-search",
        success: true,
        ...search,
      });
    },
  }),

  [DOCS_INDEX_TOOL]: tool({
    description:
      "List all local authoring guide topics with title and description (no qkrpc).",
    inputSchema: z.object({}),
    execute: async () => {
      const topics = await listActionAuthoringTopics();
      return formatLocalToolResult({
        action: "docs-index",
        success: true,
        topics,
      });
    },
  }),

  [DOCS_GET_REFERENCE_TOOL]: tool({
    description:
      "Read a module-detail appendix under a topic (references/{topic}/{file}.md). List ids via docs_index (references[] on each topic) or errors.",
      inputSchema: z.object({
      topic: z.string().describe("Skill topic id, e.g. step-runner-get"),
      file: z.string().describe('Appendix id without .md (when topic has references/)'),
    }),
    execute: async ({ topic, file }) => {
      const result = await getActionAuthoringReference(topic, file);
      if (!result.ok) {
        return formatLocalToolResult(
          {
            action: "docs-get",
            errorMessage: result.error,
            availableTopics: result.availableTopics,
            availableReferences: result.availableReferences,
          },
          false,
          result.error,
        );
      }
      return formatLocalToolResult({
        action: "docs-get",
        success: true,
        topic: result.doc.topic,
        reference: result.doc.reference,
        title: result.doc.title,
        description: result.doc.description,
        markdown: result.doc.markdown,
      });
    },
  }),

  qkrpc_action_list: tool({
    description:
      "List local Quicker actions (scope/query/limit). Query uses:<subProgramName> finds actions calling that global subprogram; uses-only: for dedicated wrappers. UI renders the result table in chat — do not repeat the list as a markdown table in your reply; summarize count and next steps only.",
    inputSchema: z.object({
      query: z.string().optional(),
      scope: z.string().optional().describe("e.g. agent, chrome, global"),
      limit: z.number().int().min(1).max(100).optional(),
      sort: z
        .enum(["relevance", "lastEdit", "title"])
        .optional()
        .describe("lastEdit when listing recent; relevance when filtering by query"),
    }),
    execute: async ({ query, scope, limit, sort }) => {
      const args = ["action", "list"];
      if (query) args.push("--query", query);
      if (scope) args.push("--scope", scope);
      if (limit != null) args.push("--limit", String(limit));
      if (sort) args.push("--sort", sort);
      else if (!query?.trim()) args.push("--sort", "lastEdit");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_action_search: tool({
    description:
      "Search local actions (main search scoring). Query uses:<subProgramName> or uses-only:<name> finds actions referencing a global subprogram. UI renders results in chat — do not duplicate as a markdown table; give a short summary only.",
    inputSchema: z.object({
      query: z.string(),
      scope: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async ({ query, scope, limit }) => {
      const args = ["action", "search", "--query", query];
      if (scope) args.push("--scope", scope);
      if (limit != null) args.push("--limit", String(limit));
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_action_get: tool({
    description:
      "Read action by GUID. returnMode: structure (default) | full | metadata — see docs_get topic workspace-editing. Syncs via action extract to .quicker/actions/{id} when the action has steps, variables, or embedded subPrograms (subprograms/{id}/ trees). Response: editVersion + compressed metadata; workspaceProject.embeddedSubProgramCount when synced. Edit disk via workspace_action_*_data. inputParams keys require qkrpc_step_runner_get.",
    inputSchema: z.object({
      id: z.string().uuid(),
      returnMode: returnModeSchema
        .optional()
        .describe(
          "structure | full | metadata — see tool description for compressed fields",
        ),
    }),
    execute: async ({ id, returnMode }) => {
      const args = ["action", "get", "--id", id];
      args.push("--return-mode", returnMode ?? "structure");
      const getResult = await runQkrpcForTool(args);
      if (!getResult.ok) {
        return formatQkrpcResultForAgent(getResult);
      }
      const payload = parseQkrpcPayload(getResult);
      const sync = programHasBodyFromGetPayload(payload)
        ? await syncActionToWorkspace(id)
        : {
            ok: false as const,
            reason: "empty_program" as const,
            error:
              "Action has no steps or variables; skipped extract to avoid writing an empty data.json.",
          };
      if (sync.ok) {
        registerLocalActionProject(id);
      }
      return augmentActionGetWithWorkspace(getResult, sync);
    },
  }),

  qkrpc_action_create: tool({
    description:
      "Create a new action on the qkrpc virtual action page. Bootstraps .quicker/actions/{actionId}/info.json + empty data.json from the create response. Do not call qkrpc_action_get afterward — use returned actionId/editVersion and workspace_action_*_data or the main editor, then workspace_program_patch.",
    inputSchema: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      icon: z
        .string()
        .optional()
        .describe("fa:Light_Name[:#color] or absolute http(s) image URL"),
      profileId: z
        .string()
        .uuid()
        .optional()
        .describe("Specific @qkrpc virtual page id"),
    }),
    execute: async ({ title, description, icon, profileId }) => {
      const args = ["action", "create"];
      if (title) args.push("--title", title);
      if (description) args.push("--description", description);
      if (icon) args.push("--icon", icon);
      if (profileId) args.push("--profile-id", profileId);
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
        title,
        description,
        icon,
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
          "已用 create 返回值写入 info.json 与空 data.json。下一步在编辑器或 workspace_action_edit_data 添加步骤，再 workspace_program_patch；勿再对 Agent 调用 qkrpc_action_get。",
      });
    },
  }),

  qkrpc_action_replace: tool({
    description:
      "Replace action steps/variables entirely in Quicker (inline JSON). Prefer workspace_action_write_data + qkrpc_action_patch for agent editing.",
    inputSchema: z.object({
      id: z.string().uuid(),
      xaction: z
        .record(z.unknown())
        .describe("Full XAction JSON (steps, variables, etc.)"),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async ({ id, xaction, expectedEditVersion, force }) => {
      const base = ["action", "replace", "--id", id];
      if (expectedEditVersion != null) {
        base.push("--expected-edit-version", String(expectedEditVersion));
      }
      if (force) base.push("--force");
      return formatQkrpcResultForAgent(
        await runQkrpcWithXactionForTool(base, xaction),
      );
    },
  }),

  workspace_action_file_info: tool({
    description:
      "File metadata before editing: size, line count, readRecommended. "
      + "target: action | global_subprogram | embedded_subprogram (needs subProgramId). "
      + "data.json: read_data mode=summary.",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      path: z.string().describe("files/… (e.g. files/main.cs)"),
    }),
    execute: async (input) => executeWorkspaceProgramFileInfo(input),
  }),

  workspace_action_file_search: tool({
    description:
      "Search literal text under files/. Returns line/column — then file_read(startLine) and file_edit. "
      + "target selects action / global subprogram / embedded subprogram project root.",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      path: z
        .string()
        .optional()
        .describe('Scope: "files", "files/subdir", or "files/foo.cs" (default files)'),
      query: z.string().min(1).describe("Literal substring to find"),
      maxMatches: z.number().int().min(1).max(50).optional(),
      caseInsensitive: z.boolean().optional(),
    }),
    execute: async (input) => executeWorkspaceProgramFileSearch(input),
  }),

  workspace_action_file_read: tool({
    description:
      "Read a slice of files/ UTF-8 text. Large files: file_info → file_search → file_read → file_edit. "
      + "target: action | global_subprogram | embedded_subprogram.",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      path: z.string().describe("files/… under the program project"),
      ...workspaceReadSliceSchema,
    }),
    execute: async (input) => executeWorkspaceProgramFileRead(input),
  }),

  workspace_action_file_write: tool({
    description:
      "Create or fully replace a files/ resource. target: action | global_subprogram | embedded_subprogram. "
      + "Then patch. *.form.json must be valid qkrpc.form.v1 JSON.",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      path: z.string().describe("files/… under the program project"),
      content: z.string(),
    }),
    execute: async (input) => executeWorkspaceProgramFileWrite(input),
  }),

  workspace_action_file_edit: tool({
    description:
      "Exact search/replace in files/ (oldString unique unless replaceAll). "
      + "target: action | global_subprogram | embedded_subprogram.",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      path: z.string().describe("files/… under the program project"),
      oldString: z
        .string()
        .min(1)
        .describe("Exact text from disk; include surrounding lines for uniqueness"),
      newString: z.string(),
      replaceAll: z.boolean().optional(),
    }),
    execute: async (input) => executeWorkspaceProgramFileEdit(input),
  }),

  workspace_action_read_data: tool({
    description:
      "Read data.json. target=action (default) | global_subprogram | embedded_subprogram (subProgramId required). "
      + "Prefer mode=summary; after edit/write → workspace_program_patch or qkrpc_action_patch.",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      mode: z
        .enum(["content", "summary"])
        .optional()
        .describe("summary (preferred before edits) or content slice"),
      ...workspaceReadSliceSchema,
    }),
    execute: async (input) => executeWorkspaceProgramReadData(input),
  }),

  workspace_action_write_data: tool({
    description:
      "Write full data.json (steps + variables[]). target selects project root. "
      + "Then workspace_program_patch / qkrpc_action_patch immediately.",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      content: z.string().describe("Full data.json UTF-8 text"),
    }),
    execute: async (input) => executeWorkspaceProgramWriteData(input),
  }),

  workspace_action_edit_data: tool({
    description:
      "Exact search/replace in data.json. target: action | global_subprogram | embedded_subprogram. "
      + "Then workspace_program_patch / qkrpc_action_patch.",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      oldString: z.string().min(1).describe("Exact JSON fragment from read_data"),
      newString: z.string(),
      replaceAll: z.boolean().optional(),
    }),
    execute: async (input) => executeWorkspaceProgramEditData(input),
  }),

  workspace_action_projects: tool({
    description:
      "List local workspace program projects under .quicker/actions and/or .quicker/subprograms.",
    inputSchema: z.object({
      target: z
        .enum(["action", "global_subprogram", "all"])
        .optional()
        .describe("Filter listed projects (default all)"),
    }),
    execute: async ({ target }) =>
      executeWorkspaceProgramProjects({ target: target ?? "all" }),
  }),

  workspace_program_patch: tool({
    description:
      "Save workspace program to Quicker after editing data.json / files/. "
      + "target=action → action apply; global_subprogram → subprogram import; "
      + "embedded_subprogram → parent action apply (compiles subprograms/{id}/).",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      force: z.boolean().optional(),
    }),
    execute: async (input) => executeWorkspaceProgramPatch(input),
  }),

  qkrpc_action_publish: tool({
    description:
      "Share or refresh an action on getquicker.net. Auto-detects first publish vs update. First publish: local action id, title + description (or from action metadata), optional note/tags/keywords; Quicker must be logged in; public share needs custom icon (not _system). Update existing share: id (local or shared GUID) + changelog required.",
    inputSchema: z.object({
      id: z.string().uuid().describe("Local action GUID (first publish) or local/shared GUID (update)"),
      title: z.string().optional().describe("Share title (first publish; defaults to action title)"),
      description: z.string().optional().describe("Short description (first publish; defaults to action description)"),
      note: z.string().optional().describe("Share page intro markdown (Note)"),
      tags: z.string().optional().describe("Comma-separated tags"),
      keywords: z.string().optional().describe("Comma-separated search keywords"),
      changelog: z.string().optional().describe("Change log markdown (required when updating an existing share)"),
      isPublic: z.boolean().optional().describe("Public share (default true; set false for private)"),
      submitReview: z.boolean().optional().describe("Submit for review on first publish (default true)"),
    }),
    execute: async ({
      id,
      title,
      description,
      note,
      tags,
      keywords,
      changelog,
      isPublic,
      submitReview,
    }) => {
      const args = ["action", "publish", "--id", id];
      if (title) args.push("--title", title);
      if (description) args.push("--description", description);
      if (note) args.push("--share-note", note);
      if (tags) args.push("--tags", tags);
      if (keywords) args.push("--keywords", keywords);
      if (changelog) args.push("--changelog", changelog);
      if (isPublic === false) args.push("--private");
      if (submitReview === false) args.push("--no-submit-review");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_action_update: tool({
    description:
      "Legacy alias: refresh an already-shared action on getquicker.net (changelog required). Prefer qkrpc_action_publish for first share or update.",
    inputSchema: z.object({
      id: z.string().uuid().describe("Local or shared action GUID"),
      changelog: z.string().optional().describe("Change log markdown (required for update)"),
    }),
    execute: async ({ id, changelog }) => {
      const args = ["action", "update", "--id", id];
      if (changelog) args.push("--changelog", changelog);
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_action_float: tool({
    description: "Show a local action as a floating button.",
    inputSchema: z.object({
      id: z.string().describe("Action id (GUID) or name"),
    }),
    execute: async ({ id }) =>
      formatQkrpcResultForAgent(
        await runQkrpcForTool(["action", "float", "--id", id]),
      ),
  }),

  qkrpc_action_edit: tool({
    description: "Open the Quicker action designer UI for a local action.",
    inputSchema: z.object({
      id: z.string().uuid(),
    }),
    execute: async ({ id }) =>
      formatQkrpcResultForAgent(
        await runQkrpcForTool(["action", "edit", "--id", id]),
      ),
  }),

  qkrpc_action_edit_var: tool({
    description:
      "Edit a variable default headlessly (local action or global subprogram; no designer UI).",
    inputSchema: z.object({
      id: z.string().describe("Action GUID or subprogram id/name"),
      var: z.string().describe("Variable key"),
      value: z.string().describe("New default value"),
    }),
    execute: async ({ id, var: variableKey, value }) =>
      formatQkrpcResultForAgent(
        await runQkrpcForTool([
          "action",
          "edit-var",
          "--id",
          id,
          "--var",
          variableKey,
          "--value",
          value,
        ]),
      ),
  }),

  qkrpc_action_patch: tool({
    description:
      "Save workspace program to Quicker (alias of workspace_program_patch with target=action). "
      + "Prefer workspace_program_patch with explicit target for actions, global subprograms, or embedded subprograms.",
    inputSchema: z.object({
      ...workspaceProgramIdSchema,
      force: z.boolean().optional(),
    }),
    execute: async (input) =>
      executeWorkspaceProgramPatch({ ...input, target: input.target ?? "action" }),
  }),

  qkrpc_action_set_metadata: tool({
    description: "Update action title, description, and/or icon only.",
    inputSchema: z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      description: z.string().optional(),
      icon: z.string().optional(),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async ({
      id,
      title,
      description,
      icon,
      expectedEditVersion,
      force,
    }) => {
      const args = ["action", "set-metadata", "--id", id];
      if (title != null) args.push("--title", title);
      if (description != null) args.push("--description", description);
      if (icon != null) args.push("--icon", icon);
      if (expectedEditVersion != null) {
        args.push("--expected-edit-version", String(expectedEditVersion));
      }
      if (force) args.push("--force");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_action_delete: tool({
    description:
      "Permanently delete a local Quicker action (CLI: action delete --yes). Destructive: only when the user asked to delete. The chat UI shows Confirm/Cancel before execution.",
    needsApproval: true,
    inputSchema: z.object({
      id: z.string().uuid().describe("Action GUID to delete"),
    }),
    execute: async ({ id }: { id: string }) =>
      formatQkrpcResultForAgent(
        await runQkrpcForTool(["action", "delete", "--id", id, "--yes"]),
      ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needsApproval + execute
  } as any),

  qkrpc_action_run: tool({
    description: "Run a local action by id or name.",
    inputSchema: z.object({
      id: z.string().describe("Action id (GUID) or name"),
      param: z.string().optional(),
      wait: z.boolean().optional(),
      debug: z.boolean().optional(),
    }),
    execute: async ({ id, param, wait, debug }) => {
      const args = ["action", "run", "--id", id];
      if (param) args.push("--param", param);
      if (wait) args.push("--wait");
      if (debug) args.push("--debug");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_action_move: tool({
    description:
      "Move a local action to another profile (action page). Target profile is id or name (e.g. _global). Omit row/col for first empty slot; provide both row and col for a specific cell. Use swap only when the user accepts swapping with an occupied slot.",
    inputSchema: z.object({
      id: z.string().uuid().describe("Action GUID"),
      profile: z
        .string()
        .describe("Target profile id, name, or scope (e.g. _global)"),
      row: z.number().int().min(0).optional(),
      col: z.number().int().min(0).optional(),
      swap: z.boolean().optional(),
    }),
    execute: async ({ id, profile, row, col, swap }) => {
      const args = ["action", "move", "--id", id, "--profile", profile];
      if (row != null) args.push("--row", String(row));
      if (col != null) args.push("--col", String(col));
      if (swap) args.push("--swap");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_profile_create: tool({
    description:
      "Create blank global action profile pages (tabs). Use afterFirst to insert immediately after _global (first global page); required for reserved slots near the top.",
    inputSchema: z.object({
      count: z.number().int().min(1).max(20).optional(),
      afterFirst: z
        .boolean()
        .optional()
        .describe("Insert after _global instead of appending to the end"),
    }),
    execute: async ({ count, afterFirst }) => {
      const args = ["profile", "create", "--scope", "global"];
      if (count != null) args.push("--count", String(count));
      if (afterFirst) args.push("--after-first");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_profile_reorder: tool({
    description:
      "Move existing global profile tabs to sit right after _global. Pass profileIds in the desired tab order.",
    inputSchema: z.object({
      profileIds: z
        .array(z.string().uuid())
        .min(1)
        .describe("Profile GUIDs to move, in order"),
    }),
    execute: async ({ profileIds }) => {
      const args = [
        "profile",
        "reorder",
        "--scope",
        "global",
        "--after-first",
        "--ids",
        profileIds.join(","),
      ];
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_process_ensure: tool({
    description:
      "Ensure a Quicker virtual process and its dedicated action page (scene/action management). Optionally move actions that call a global subprogram into that page (collectSubProgramName + moveActions). See docs_get topic action-organization-workflow.",
    inputSchema: z.object({
      exeFile: z
        .string()
        .describe("Virtual process key (ExeFile), e.g. _ceacore_run"),
      displayName: z
        .string()
        .describe("Display name in scene/action management"),
      profileNamePrefix: z
        .string()
        .describe('Prefix for auto-created action page names, e.g. "@CeaCore "'),
      collectSubProgramName: z
        .string()
        .optional()
        .describe("Required with moveActions: global subprogram id/name"),
      moveActions: z
        .boolean()
        .optional()
        .describe("Move matching actions into the virtual page"),
      moveAny: z
        .boolean()
        .optional()
        .describe(
          "With moveActions: move any action with a matching call (default: dedicated wrappers only)",
        ),
    }),
    execute: async ({
      exeFile,
      displayName,
      profileNamePrefix,
      collectSubProgramName,
      moveActions,
      moveAny,
    }) => {
      const args = [
        "process",
        "ensure",
        "--exe",
        exeFile,
        "--name",
        displayName,
        "--profile-prefix",
        profileNamePrefix,
      ];
      if (moveActions) {
        args.push("--move-actions");
        if (collectSubProgramName) {
          args.push("--collect-subprogram", collectSubProgramName);
        }
        if (moveAny) args.push("--move-any");
      }
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_subprogram_list: tool({
    description:
      "List global subprograms (optional query filter). Returns callIdentifier for sys:subprogram.",
    inputSchema: z.object({
      query: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async ({ query, limit }) => {
      const args = ["subprogram", "list"];
      if (query) args.push("--query", query);
      if (limit != null) args.push("--limit", String(limit));
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_subprogram_create: tool({
    description:
      "Create a new global subprogram. Bootstraps .quicker/subprograms/{subProgramId}/ via internal metadata get (info.json with title) + empty data.json. Use returned subProgramId/editVersion/callIdentifier and workspace_action_*_data (target=global_subprogram) or the main editor, then workspace_program_patch.",
    inputSchema: z.object({
      name: z.string(),
      description: z.string().optional(),
      icon: z
        .string()
        .optional()
        .describe("fa:Light_Name[:#color] or absolute http(s) image URL"),
    }),
    execute: async ({ name, description, icon }) => {
      const args = ["subprogram", "create", "--name", name];
      if (description) args.push("--description", description);
      if (icon) args.push("--icon", icon);
      const createResult = await runQkrpcForTool(args);
      if (!createResult.ok) {
        return formatQkrpcResultForAgent(createResult);
      }
      const payload = parseQkrpcPayload(createResult);
      const subProgramId =
        typeof payload?.subProgramId === "string"
          ? payload.subProgramId
          : undefined;
      if (!subProgramId) {
        return formatQkrpcResultForAgent(createResult);
      }
      const { bootstrapSubprogramProjectForCreate } = await import(
        "@/lib/subprogram-project-workflow"
      );
      const sync = await bootstrapSubprogramProjectForCreate(payload ?? {}, {
        description,
        icon,
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
              : name,
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
          "已用 metadata get 写入 info.json（含标题）与空 data.json。下一步在编辑器或 workspace_action_edit_data（target=global_subprogram）添加步骤，再 workspace_program_patch。",
      });
    },
  }),

  qkrpc_subprogram_patch: tool({
    description:
      "Apply inline partial patch to a global subprogram (CLI patch JSON). "
      + "Prefer workspace workflow: qkrpc_subprogram_get → workspace_action_*_data with target=global_subprogram → workspace_program_patch.",
    inputSchema: z.object({
      id: z.string().describe("Subprogram id or name"),
      patch: z.record(z.unknown()),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async ({ id, patch, expectedEditVersion, force }) => {
      const base = ["subprogram", "patch", "--id", id];
      if (expectedEditVersion != null) {
        base.push("--expected-edit-version", String(expectedEditVersion));
      }
      if (force) base.push("--force");
      return formatQkrpcResultForAgent(
        await runQkrpcWithPatchFileForTool(base, patch),
      );
    },
  }),

  qkrpc_subprogram_replace: tool({
    description: "Replace subprogram steps/variables entirely.",
    inputSchema: z.object({
      id: z.string().describe("Subprogram id or name"),
      program: z
        .record(z.unknown())
        .describe("Program JSON with steps and/or variables"),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async ({ id, program, expectedEditVersion, force }) => {
      const base = ["subprogram", "replace", "--id", id];
      if (expectedEditVersion != null) {
        base.push("--expected-edit-version", String(expectedEditVersion));
      }
      if (force) base.push("--force");
      return formatQkrpcResultForAgent(
        await runQkrpcWithProgramForTool(base, program),
      );
    },
  }),

  qkrpc_subprogram_export: tool({
    description:
      "Export subprogram to a .quicker project directory (info.json + data.json).",
    inputSchema: z.object({
      id: z.string().describe("Subprogram id or name"),
      dir: z.string().describe("Project directory path"),
    }),
    execute: async ({ id, dir }) =>
      formatQkrpcResultForAgent(
        await runQkrpcForTool([
          "subprogram",
          "export",
          "--id",
          id,
          "--dir",
          dir,
        ]),
      ),
  }),

  qkrpc_subprogram_import: tool({
    description: "Import a .quicker subprogram project directory.",
    inputSchema: z.object({
      dir: z.string().describe("Project directory with info.json + data.json"),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async ({ dir, expectedEditVersion, force }) => {
      const args = ["subprogram", "import", "--dir", dir];
      if (expectedEditVersion != null) {
        args.push("--expected-edit-version", String(expectedEditVersion));
      }
      if (force) args.push("--force");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_subprogram_edit: tool({
    description: "Open the Quicker subprogram editor UI.",
    inputSchema: z.object({
      id: z.string().describe("Subprogram id or name"),
    }),
    execute: async ({ id }) =>
      formatQkrpcResultForAgent(
        await runQkrpcForTool(["subprogram", "edit", "--id", id]),
      ),
  }),

  qkrpc_subprogram_edit_var: tool({
    description: "Edit a subprogram variable default headlessly (no designer UI).",
    inputSchema: z.object({
      id: z.string().describe("Subprogram id or name"),
      var: z.string().describe("Variable key"),
      value: z.string().describe("New default value"),
    }),
    execute: async ({ id, var: variableKey, value }) =>
      formatQkrpcResultForAgent(
        await runQkrpcForTool([
          "subprogram",
          "edit-var",
          "--id",
          id,
          "--var",
          variableKey,
          "--value",
          value,
        ]),
      ),
  }),

  qkrpc_subprogram_delete: tool({
    description:
      "Permanently delete a global subprogram. Destructive: only when the user asked to delete.",
    needsApproval: true,
    inputSchema: z.object({
      id: z.string().describe("Subprogram id or name to delete"),
    }),
    execute: async ({ id }: { id: string }) =>
      formatQkrpcResultForAgent(
        await runQkrpcForTool(["subprogram", "delete", "--id", id, "--yes"]),
      ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needsApproval + execute
  } as any),

  qkrpc_subprogram_search: tool({
    description: "Search global subprograms (returns callIdentifier).",
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async ({ query, limit }) => {
      const args = ["subprogram", "search", "--query", query];
      if (limit != null) args.push("--limit", String(limit));
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_subprogram_get: tool({
    description:
      "Read compressed subprogram by id or name. Syncs via subprogram export to .quicker/subprograms/{id|name}/ when the subprogram has steps or variables. Edit disk via workspace_action_*_data with target=global_subprogram.",
    inputSchema: z.object({
      id: z.string().describe("Subprogram id or name"),
      returnMode: returnModeSchema.optional(),
    }),
    execute: async ({ id, returnMode }) => {
      const args = ["subprogram", "get", "--id", id];
      if (returnMode) args.push("--return-mode", returnMode);
      const getResult = await runQkrpcForTool(args);
      if (!getResult.ok) {
        return formatQkrpcResultForAgent(getResult);
      }
      const { augmentSubprogramGetWithWorkspace, syncSubprogramGetToWorkspace } =
        await import("@/lib/subprogram-project-workflow");
      const sync = await syncSubprogramGetToWorkspace(id, getResult);
      return augmentSubprogramGetWithWorkspace(getResult, sync);
    },
  }),

  qkrpc_step_runner_search: tool({
    description:
      "Search StepRunner catalog (| OR, * wildcard). Non-empty query: items[].controlField { key, value, name? } (best match). OR (|) may also return items[].controlFields[] when multiple control modes match — pick the value for your branch, then step-runner get; do not guess. Empty query omits controlField.",
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(80).optional(),
    }),
    execute: async ({ query, limit }) => {
      const args = ["step-runner", "search", "--query", query];
      if (limit != null) args.push("--limit", String(limit));
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(args, { timeoutMs: 180_000 }),
      );
    },
  }),

  qkrpc_step_runner_get: tool({
    description:
      "Agent-only StepRunner schema (step-runner get, not get-ui). Required before patching inputParams. Compressed JSON without module icon. controlField: copy items[].controlField.value from search when present. Without controlField, controlField.selection[] lists each mode with visibleInputKeys. See docs_get topic step-runner-get.",
    inputSchema: z.object({
      key: z.string().describe("StepRunner key from search items[].key"),
      controlField: z
        .string()
        .optional()
        .describe("Required when search returned controlField; use controlField.value"),
    }),
    execute: async ({ key, controlField }) => {
      const args = ["step-runner", "get", "--key", key];
      if (controlField) args.push("--control-field", controlField);
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(args, { timeoutMs: 180_000 }),
      );
    },
  }),

  qkrpc_fa_search: tool({
    description: "Search Font Awesome icons for action icon specs.",
    inputSchema: z.object({
      query: z.string().optional(),
      limit: z.number().int().min(1).max(80).optional(),
      expand: z
        .boolean()
        .optional()
        .describe("Return all style rows (Solid/Regular/Light) instead of merged Light_*"),
    }),
    execute: async ({ query, limit, expand }) => {
      const args = ["fa", "search"];
      if (query) args.push("--query", query);
      if (limit != null) args.push("--limit", String(limit));
      if (expand) args.push("--expand");
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_fa_resolve: tool({
    description: "Resolve fa: icon specs to SVG path data.",
    inputSchema: z.object({
      spec: z.string().optional().describe("Single fa: spec, e.g. fa:Light_Flask"),
      specs: z
        .array(z.string())
        .optional()
        .describe("Batch resolve (max 80 unique specs)"),
    }),
    execute: async ({ spec, specs }) => {
      const args = ["fa", "resolve"];
      if (specs?.length) {
        args.push("--specs", JSON.stringify(specs));
      } else if (spec) {
        args.push("--spec", spec);
      }
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),
};
