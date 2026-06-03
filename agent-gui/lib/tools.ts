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
import {
  augmentActionGetWithWorkspace,
  buildWorkspaceProjectSummary,
  getActionProjectDataSummary,
  saveActionFromWorkspace,
  syncActionToWorkspace,
} from "@/lib/action-project-workflow";
import { resolveActionDataJsonPath } from "@/lib/action-project-data-file.server";
import { listWorkspaceActionProjects } from "@/lib/action-explorer-server";
import {
  editWorkspaceFile,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "@/lib/workspace-fs";
import {
  formatQkrpcResultForAgent,
  runQkrpcForTool,
  runQkrpcWithPatchFileForTool,
  runQkrpcWithProgramForTool,
  runQkrpcWithXactionForTool,
} from "@/lib/qkrpc";

const returnModeSchema = z.enum(["full", "structure", "metadata"]);

export const quickerTools = {
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
      "Read a reference appendix from the authoring skill (e.g. step-modules modules-table).",
    inputSchema: z.object({
      topic: z.string().describe("Skill topic id"),
      file: z.string().describe('Reference file id without .md, e.g. "modules-table"'),
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
      "List local Quicker actions (scope/query/limit). UI renders the result table in chat — do not repeat the list as a markdown table in your reply; summarize count and next steps only.",
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
      "Search local actions (main search scoring). UI renders results in chat — do not duplicate as a markdown table; give a short summary only.",
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
      "Read action by GUID. returnMode: structure (default) | full | metadata — see docs_get topic workspace-editing. Syncs to .quicker/actions/{id}. Response: editVersion + compressed metadata; steps/variables on disk (workspaceProject summary). stepId is temporary; after patch use addedSteps. inputParams keys require qkrpc_step_runner_get.",
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
      const sync = await syncActionToWorkspace(id);
      return augmentActionGetWithWorkspace(getResult, sync);
    },
  }),

  qkrpc_action_validate: tool({
    description:
      "Validate local .quicker/actions/{id} project (data.json + file refs). Returns stepCount, variableCount, stepsOutline — prefer over workspace_action_read_data after edit/patch when you only need to verify structure.",
    inputSchema: z.object({
      id: z.string().uuid().describe("Quicker action GUID"),
    }),
    execute: async ({ id }) => {
      const result = await getActionProjectDataSummary(id);
      if (!result.ok) {
        return formatLocalToolResult(
          {
            action: "action-validate",
            success: false,
            errorMessage: result.error,
          },
          false,
          result.error,
        );
      }
      const { summary } = result;
      return formatLocalToolResult(
        {
          action: "action-validate",
          success: summary.validated,
          ...summary,
        },
        summary.validated,
        summary.validationError,
      );
    },
  }),

  qkrpc_action_create: tool({
    description: "Create a new action on the qkrpc virtual action page.",
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
      const parsed = createResult.parsed as Record<string, unknown> | null;
      const actionId =
        typeof parsed?.actionId === "string" ? parsed.actionId : undefined;
      if (!actionId) {
        return formatQkrpcResultForAgent(createResult);
      }
      const sync = await syncActionToWorkspace(actionId);
      if (!sync.ok) {
        return formatQkrpcResultForAgent(createResult);
      }
      return formatLocalToolResult({
        ...((parsed ?? {}) as Record<string, unknown>),
        action: "create",
        ok: true,
        workspaceSynced: true,
        workspaceProject: buildWorkspaceProjectSummary(sync.manifest),
      });
    },
  }),

  qkrpc_action_replace: tool({
    description:
      "Replace action steps/variables entirely (one save). Prefer patch for partial edits.",
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

  workspace_file_read: tool({
    description:
      "Read a UTF-8 file by relative path. For action data.json use workspace_action_read_data({ id }) instead of manual paths.",
    inputSchema: z.object({
      path: z.string().describe("Relative path from working directory"),
      offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(200_000).optional(),
    }),
    execute: async ({ path, offset, limit }) => {
      const result = await readWorkspaceFile(path, { offset, limit });
      if (!result.ok) {
        return formatLocalToolResult(
          { action: "file-read", success: false, errorMessage: result.error },
          false,
          result.error,
        );
      }
      return formatLocalToolResult({
        action: "file-read",
        success: true,
        path: result.path,
        content: result.content,
        truncated: result.truncated,
        totalChars: result.totalChars,
      });
    },
  }),

  workspace_file_write: tool({
    description:
      "Write a UTF-8 file by relative path. For action steps/variables use workspace_action_write_data({ id, content }) instead of manual .quicker/actions/.../data.json paths.",
    inputSchema: z.object({
      path: z.string().describe("Relative path from working directory"),
      content: z.string(),
    }),
    execute: async ({ path, content }) => {
      const result = await writeWorkspaceFile(path, content);
      if (!result.ok) {
        return formatLocalToolResult(
          { action: "file-write", success: false, errorMessage: result.error },
          false,
          result.error,
        );
      }
      return formatLocalToolResult({
        action: "file-write",
        success: true,
        path: result.path,
        bytesWritten: result.bytesWritten,
      });
    },
  }),

  workspace_file_edit: tool({
    description:
      "Replace text in a workspace file (exact oldString match). Prefer for small edits; use file_write for full rewrites.",
    inputSchema: z.object({
      path: z.string(),
      oldString: z.string().min(1),
      newString: z.string(),
      replaceAll: z.boolean().optional(),
    }),
    execute: async ({ path, oldString, newString, replaceAll }) => {
      const result = await editWorkspaceFile(path, oldString, newString, replaceAll);
      if (!result.ok) {
        return formatLocalToolResult(
          { action: "file-edit", success: false, errorMessage: result.error },
          false,
          result.error,
        );
      }
      return formatLocalToolResult({
        action: "file-edit",
        success: true,
        path: result.path,
        replacements: result.replacements,
      });
    },
  }),

  workspace_action_read_data: tool({
    description:
      "Read action data.json by GUID. mode=summary returns stepsOutline/variableKeys + validation (for post-edit verification — do NOT read full JSON just to confirm). mode=content (default) returns file text; use offset/limit for fragments. Before first edit you may need content; after edit_data trust replacements + projectSummary or qkrpc_action_validate.",
    inputSchema: z.object({
      id: z.string().uuid().describe("Quicker action GUID"),
      mode: z
        .enum(["content", "summary"])
        .optional()
        .describe("summary = outline only; content = full/partial text"),
      offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(200_000).optional(),
    }),
    execute: async ({ id, mode, offset, limit }) => {
      if (mode === "summary") {
        const result = await getActionProjectDataSummary(id);
        if (!result.ok) {
          return formatLocalToolResult(
            {
              action: "action-data-summary",
              success: false,
              errorMessage: result.error,
            },
            false,
            result.error,
          );
        }
        return formatLocalToolResult({
          action: "action-data-summary",
          success: result.summary.validated,
          ...result.summary,
        });
      }

      const resolved = await resolveActionDataJsonPath(id);
      if (!resolved.ok) {
        return formatLocalToolResult(
          { action: "action-data-read", success: false, errorMessage: resolved.error },
          false,
          resolved.error,
        );
      }
      const result = await readWorkspaceFile(resolved.resolved.path, {
        offset,
        limit,
      });
      if (!result.ok) {
        return formatLocalToolResult(
          { action: "action-data-read", success: false, errorMessage: result.error },
          false,
          result.error,
        );
      }
      return formatLocalToolResult({
        action: "action-data-read",
        success: true,
        actionId: resolved.resolved.actionId,
        projectDir: resolved.resolved.projectDir,
        path: result.path,
        content: result.content,
        truncated: result.truncated,
        totalChars: result.totalChars,
      });
    },
  }),

  workspace_action_write_data: tool({
    description:
      "Write full data.json (steps + variables[]) by action GUID. defaultValue must be strings; use numeric type (or varType normalized on save). Then qkrpc_action_patch to sync to Quicker.",
    inputSchema: z.object({
      id: z.string().uuid().describe("Quicker action GUID"),
      content: z.string().describe("Full data.json UTF-8 text"),
    }),
    execute: async ({ id, content }) => {
      const resolved = await resolveActionDataJsonPath(id);
      if (!resolved.ok) {
        return formatLocalToolResult(
          { action: "action-data-write", success: false, errorMessage: resolved.error },
          false,
          resolved.error,
        );
      }
      const result = await writeWorkspaceFile(resolved.resolved.path, content);
      if (!result.ok) {
        return formatLocalToolResult(
          { action: "action-data-write", success: false, errorMessage: result.error },
          false,
          result.error,
        );
      }
      const summaryResult = await getActionProjectDataSummary(id);
      return formatLocalToolResult({
        action: "action-data-write",
        success: true,
        actionId: resolved.resolved.actionId,
        projectDir: resolved.resolved.projectDir,
        path: result.path,
        bytesWritten: result.bytesWritten,
        projectSummary: summaryResult.ok ? summaryResult.summary : undefined,
      });
    },
  }),

  workspace_action_edit_data: tool({
    description:
      "Search/replace inside an action's data.json by action GUID (exact oldString match). Response includes replacements + projectSummary — use that or qkrpc_action_validate to verify; do not read full data.json afterward.",
    inputSchema: z.object({
      id: z.string().uuid().describe("Quicker action GUID"),
      oldString: z.string().min(1),
      newString: z.string(),
      replaceAll: z.boolean().optional(),
    }),
    execute: async ({ id, oldString, newString, replaceAll }) => {
      const resolved = await resolveActionDataJsonPath(id);
      if (!resolved.ok) {
        return formatLocalToolResult(
          { action: "action-data-edit", success: false, errorMessage: resolved.error },
          false,
          resolved.error,
        );
      }
      const result = await editWorkspaceFile(
        resolved.resolved.path,
        oldString,
        newString,
        replaceAll,
      );
      if (!result.ok) {
        return formatLocalToolResult(
          { action: "action-data-edit", success: false, errorMessage: result.error },
          false,
          result.error,
        );
      }
      const summaryResult = await getActionProjectDataSummary(id);
      return formatLocalToolResult({
        action: "action-data-edit",
        success: true,
        actionId: resolved.resolved.actionId,
        projectDir: resolved.resolved.projectDir,
        path: result.path,
        replacements: result.replacements,
        projectSummary: summaryResult.ok ? summaryResult.summary : undefined,
      });
    },
  }),

  workspace_action_projects: tool({
    description:
      "List local .quicker/actions/{actionId}/ projects (dir name is the action GUID; info.json has title/icon). Refreshes the sidebar explorer; do not use generic directory listing for this.",
    inputSchema: z.object({}),
    execute: async () => {
      const result = await listWorkspaceActionProjects();
      if (!result.ok) {
        return formatLocalToolResult(
          {
            action: "action-projects",
            success: false,
            errorMessage: result.error,
          },
          false,
          result.error,
        );
      }
      return formatLocalToolResult({
        action: "action-projects",
        success: true,
        root: result.root,
        count: result.projects.length,
        projects: result.projects,
      });
    },
  }),

  qkrpc_action_update: tool({
    description: "Upload or refresh a shared action on Quicker.net.",
    inputSchema: z.object({
      id: z.string().uuid().describe("Shared action GUID"),
      changelog: z.string().optional(),
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
      "Edit a variable default via the Quicker designer UI (action or subprogram).",
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
      "Save action from workspace project to Quicker (after editing data.json / files/ on disk). Validates, compiles file refs, replaces — no inline JSON.",
    inputSchema: z.object({
      id: z.string().uuid(),
      force: z.boolean().optional(),
    }),
    execute: async ({ id, force }) => saveActionFromWorkspace({ id, force }),
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
    description: "Create a new global subprogram.",
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
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_subprogram_patch: tool({
    description:
      "Apply partial patch to a global subprogram (same JSON shape as action patch).",
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
    description: "Edit a subprogram variable default via the designer UI.",
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
    description: "Read compressed subprogram by id or name.",
    inputSchema: z.object({
      id: z.string().describe("Subprogram id or name"),
      returnMode: returnModeSchema.optional(),
    }),
    execute: async ({ id, returnMode }) => {
      const args = ["subprogram", "get", "--id", id];
      if (returnMode) args.push("--return-mode", returnMode);
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_step_runner_search: tool({
    description: "Search StepRunner catalog (| OR, * wildcard).",
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
      "Get StepRunner schema (required before patching inputParams). Use controlField when needed.",
    inputSchema: z.object({
      key: z.string().describe("StepRunner key, e.g. sys:subprogram"),
      controlField: z.string().optional(),
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
