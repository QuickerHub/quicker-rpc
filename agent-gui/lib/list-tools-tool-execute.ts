import {
  ALL_QKRPC_TOOL_IDS,
  QKRPC_TOOL_REGISTRY,
  type ToolMeta,
} from "@/lib/tool-registry";
import { CORE_TOOL_ROUTING_TABLE, TOOL_ROUTING_TABLE } from "@/lib/tool-routing";
import {
  getToolBundle,
  listToolBundles,
  toolIdToBundleId,
  type ToolBundleId,
} from "@/lib/tool-bundles";
import { formatLocalToolResult } from "@/lib/tool-result";
import { LIST_TOOLS_TOOL } from "@/lib/list-tools-tool";

export type ListToolsToolInput = {
  action: "index" | "get" | "routing" | "bundles" | "bundle";
  toolId?: string;
  bundleId?: ToolBundleId;
};

function readToolDefinition(tool: unknown): {
  description?: string;
  inputSchema?: unknown;
} {
  if (!tool || typeof tool !== "object") return {};
  const record = tool as Record<string, unknown>;
  return {
    description:
      typeof record.description === "string" ? record.description : undefined,
    inputSchema: record.inputSchema,
  };
}

function buildIndexItems(toolIds: string[]): ToolMeta[] {
  const byId = new Map(QKRPC_TOOL_REGISTRY.map((item) => [item.id, item]));
  const items: ToolMeta[] = [];
  for (const id of toolIds) {
    const meta = byId.get(id);
    if (meta) {
      items.push(meta);
      continue;
    }
    items.push({
      id,
      label: id,
      group: "read",
      category: "catalog",
      description: "Registered tool (see action=get for schema)",
    });
  }
  return items;
}

async function readToolSchemas(toolIds: readonly string[]) {
  const { quickerTools } = await import("@/lib/tools");
  const tools: Array<Record<string, unknown>> = [];
  for (const toolId of toolIds) {
    const definition = quickerTools[toolId as keyof typeof quickerTools];
    if (!definition) continue;
    const { description, inputSchema } = readToolDefinition(definition);
    const meta = QKRPC_TOOL_REGISTRY.find((item) => item.id === toolId);
    tools.push({
      toolId,
      label: meta?.label,
      group: meta?.group,
      category: meta?.category,
      description,
      inputSchema,
    });
  }
  return tools;
}

export async function executeListToolsTool(
  input: ListToolsToolInput,
): Promise<Record<string, unknown>> {
  switch (input.action) {
    case "routing":
      return formatLocalToolResult({
        action: "list-tools-routing",
        routingTable: TOOL_ROUTING_TABLE,
        coreRoutingTable: CORE_TOOL_ROUTING_TABLE,
        hint: "Core rows are in system prompt. Extended rows need list_tools action=bundle or action=get.",
      });

    case "bundles":
      return formatLocalToolResult({
        action: "list-tools-bundles",
        bundles: listToolBundles().map((bundle) => ({
          id: bundle.id,
          label: bundle.label,
          description: bundle.description,
          toolIds: [...bundle.toolIds],
        })),
        hint: "Load a pack: action=bundle bundleId=<id>. Single tool: action=get toolId=<id>.",
      });

    case "bundle": {
      const bundleId = input.bundleId;
      if (!bundleId) {
        return formatLocalToolResult(
          {
            action: "list-tools-bundle",
            errorMessage: "bundleId is required when action=bundle",
          },
          false,
          "bundleId is required when action=bundle",
        );
      }
      const bundle = getToolBundle(bundleId);
      if (!bundle) {
        return formatLocalToolResult(
          {
            action: "list-tools-bundle",
            bundleId,
            errorMessage: `Unknown bundle: ${bundleId}`,
          },
          false,
          `Unknown bundle: ${bundleId}`,
        );
      }
      return formatLocalToolResult({
        action: "list-tools-bundle",
        bundleId,
        label: bundle.label,
        description: bundle.description,
        tools: await readToolSchemas(bundle.toolIds),
      });
    }

    case "index":
      return formatLocalToolResult({
        action: "list-tools-index",
        toolIds: ALL_QKRPC_TOOL_IDS,
        tools: buildIndexItems(ALL_QKRPC_TOOL_IDS),
        bundles: listToolBundles().map((bundle) => ({
          id: bundle.id,
          label: bundle.label,
          toolCount: bundle.toolIds.length,
        })),
        count: ALL_QKRPC_TOOL_IDS.length,
        hint: "Prefer action=bundles for categorized discovery; action=get toolId for one schema.",
      });

    case "get": {
      const toolId = input.toolId?.trim();
      if (!toolId) {
        return formatLocalToolResult(
          {
            action: "list-tools-get",
            errorMessage: "toolId is required when action=get",
          },
          false,
          "toolId is required when action=get",
        );
      }

      const { quickerTools } = await import("@/lib/tools");
      const definition = quickerTools[toolId as keyof typeof quickerTools];
      if (!definition) {
        return formatLocalToolResult(
          {
            action: "list-tools-get",
            toolId,
            errorMessage: `Unknown tool: ${toolId}`,
          },
          false,
          `Unknown tool: ${toolId}`,
        );
      }

      const { description, inputSchema } = readToolDefinition(definition);
      const meta = QKRPC_TOOL_REGISTRY.find((item) => item.id === toolId);
      return formatLocalToolResult({
        action: "list-tools-get",
        toolId,
        label: meta?.label,
        group: meta?.group,
        category: meta?.category,
        bundleId: toolIdToBundleId(toolId),
        description,
        inputSchema,
      });
    }

    default:
      return formatLocalToolResult(
        {
          action: "list-tools",
          errorMessage: "action must be index | routing | bundles | bundle | get",
        },
        false,
        "action must be index | routing | bundles | bundle | get",
      );
  }
}

export { LIST_TOOLS_TOOL };
