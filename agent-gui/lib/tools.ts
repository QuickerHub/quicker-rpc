import { tool } from "ai";
import { z } from "zod";
import {
  getActionAuthoringDoc,
  listActionAuthoringTopics,
  searchActionAuthoringDocs,
} from "@/lib/action-authoring-docs";
import {
  DOCS_GET_TOOL,
  DOCS_INDEX_TOOL,
  DOCS_SEARCH_TOOL,
} from "@/lib/docs-tool";
import { formatLocalToolResult } from "@/lib/tool-result";
import {
  formatQkrpcResultForAgent,
  runQkrpcForTool,
  runQkrpcWithPatchFileForTool,
} from "@/lib/qkrpc";

const returnModeSchema = z.enum(["full", "structure", "metadata"]);

export const quickerTools = {
  [DOCS_GET_TOOL]: tool({
    description:
      'Read authoring guide from local docs/action-authoring (no qkrpc). Start with "authoring-workflow" or "overview".',
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
        markdown: result.doc.markdown,
      });
    },
  }),

  [DOCS_SEARCH_TOOL]: tool({
    description:
      "Search local authoring guides by keyword (docs/action-authoring, no qkrpc).",
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
      "List all local authoring guide topics with titles (docs/action-authoring, no qkrpc).",
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
    description: "Read compressed XAction by GUID.",
    inputSchema: z.object({
      id: z.string().uuid(),
      returnMode: returnModeSchema.optional(),
    }),
    execute: async ({ id, returnMode }) => {
      const args = ["action", "get", "--id", id];
      if (returnMode) args.push("--return-mode", returnMode);
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_action_create: tool({
    description: "Create a new action on the qkrpc virtual action page.",
    inputSchema: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      icon: z.string().optional().describe("fa:Light_Name[:#color]"),
    }),
    execute: async ({ title, description, icon }) => {
      const args = ["action", "create"];
      if (title) args.push("--title", title);
      if (description) args.push("--description", description);
      if (icon) args.push("--icon", icon);
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),

  qkrpc_action_patch: tool({
    description:
      "Apply partial XAction patch (one save). Include expectedEditVersion from action_get unless force.",
    inputSchema: z.object({
      id: z.string().uuid(),
      patch: z
        .record(z.unknown())
        .describe("Patch JSON object (steps, variables, metadata, etc.)"),
      expectedEditVersion: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    execute: async ({ id, patch, expectedEditVersion, force }) => {
      const base = ["action", "patch", "--id", id];
      if (expectedEditVersion != null) {
        base.push("--expected-edit-version", String(expectedEditVersion));
      }
      if (force) base.push("--force");
      return formatQkrpcResultForAgent(
        await runQkrpcWithPatchFileForTool(base, patch),
      );
    },
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
    }),
    execute: async ({ query, limit }) => {
      const args = ["fa", "search"];
      if (query) args.push("--query", query);
      if (limit != null) args.push("--limit", String(limit));
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    },
  }),
};
