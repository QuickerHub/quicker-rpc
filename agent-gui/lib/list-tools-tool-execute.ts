import { asSchema, type FlexibleSchema } from "ai";
import { QKRPC_TOOL_REGISTRY } from "@/lib/tool-registry";
import { getToolBundle, listToolBundles, toolIdToBundleId, type ToolBundleId } from "@/lib/tool-bundles";
import { formatLocalToolResult } from "@/lib/tool-result";
import { LIST_TOOLS_TOOL } from "@/lib/list-tools-tool";
import { describeToolModeOperations } from "./agent-tool-mode-guard";
import { describeToolApproval } from "./program-tool-operation-facts";
import type { CurrentToolCatalog } from "./current-tool-catalog";

export type ListToolsToolInput = {
  action: "index" | "get" | "routing" | "bundles" | "bundle";
  toolId?: string;
  bundleId?: ToolBundleId;
};

/** Discovery observes the current full definitions; it never executes or resolves a provider. */
export async function executeListToolsTool(input: ListToolsToolInput, catalog?: CurrentToolCatalog): Promise<Record<string, unknown>> {
  if (!catalog) return formatLocalToolResult({ errorCode: "tool_catalog_unbound" }, false,
    "Tool discovery requires the current execution scope; a global catalog is not an execution contract.", { retryable: false });
  const policy = (toolId: string) => describeToolModeOperations(toolId, catalog.mode,
    catalog.readOnlyExecutorToolIds?.includes(toolId),
    Object.hasOwn(catalog.operationConstraints ?? {}, toolId) ? catalog.operationConstraints?.[toolId] : undefined);
  const available = (toolId: string) => {
    if (!Object.hasOwn(catalog.tools, toolId)) return false;
    const decision = policy(toolId);
    return decision.allowed && (!decision.allowedActions || decision.allowedActions.length > 0);
  };
  const ids = Object.keys(catalog.tools).filter(available);
  const metaFor = (toolId: string) => {
    const definition = catalog.tools[toolId];
    const meta = QKRPC_TOOL_REGISTRY.find(item => item.id === toolId);
    return {
      toolId, label: meta?.label ?? toolId,
      // Product grouping is display metadata, never an effect or permission assertion.
      ...(meta ? { group: meta.group, category: meta.category } : {}),
      description: definition.description,
      bundleId: toolIdToBundleId(toolId),
      executionPort: definition.execute ? "server" : "renderer",
      operationPolicy: policy(toolId),
      risk: "unknown",
      approval: describeToolApproval(definition.needsApproval),
    };
  };
  const schemas = async (toolIds: readonly string[]) => Promise.all(toolIds.filter(available).map(async toolId => ({
    ...metaFor(toolId),
    inputSchema: catalog.tools[toolId].inputSchema === undefined ? undefined
      : await asSchema(catalog.tools[toolId].inputSchema as FlexibleSchema<unknown>).jsonSchema,
  })));
  const bundles = listToolBundles().map(bundle => ({
    id: bundle.id, label: bundle.label,
    description: "Current selected tools in this product grouping; consult each tool's operation policy.",
    toolIds: bundle.toolIds.filter(available),
  })).filter(bundle => bundle.toolIds.length > 0);
  const grouped = new Set(bundles.flatMap(bundle => bundle.toolIds));
  const result = (data: Record<string, unknown>) => formatLocalToolResult({
    scope: "current-execution", mode: catalog.mode, schemaIsPermission: false, ...data,
  });

  switch (input.action) {
    case "index": return result({ action: "list-tools-index", toolIds: ids, tools: ids.map(metaFor),
      bundles, unbundledToolIds: ids.filter(id => !grouped.has(id)), count: ids.length });
    case "routing": {
      const escape = (value: string) => value.replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
      const rows = ids.map(id => {
        const facts = metaFor(id);
        const operations = facts.operationPolicy.allowedActions?.join(", ") ?? "Subject to runtime validation and approval";
        return "| " + escape(id) + " | " + escape(operations) + " | " + escape(facts.description ?? "No description supplied by this definition.") + " |";
      });
      const routingTable = ["| Current tool | Allowed operations / constraints | Current definition |", "|---|---|---|", ...rows].join("\n");
      return result({ action: "list-tools-routing", routingTable, tools: ids.map(metaFor),
        hint: "This execution scope only. Schema membership and product grouping do not grant permission; runtime identity, read-proof and approval checks still apply." });
    }
    case "bundles": return result({ action: "list-tools-bundles", bundles, unbundledToolIds: ids.filter(id => !grouped.has(id)) });
    case "bundle": {
      const bundle = input.bundleId ? getToolBundle(input.bundleId) : undefined;
      if (!bundle) return formatLocalToolResult({ action: "list-tools-bundle", errorCode: "tool_bundle_unavailable" }, false,
        input.bundleId ? "Unknown tool grouping." : "bundleId is required when action=bundle");
      const selected = bundles.find(item => item.id === bundle.id);
      return result({ action: "list-tools-bundle", bundleId: bundle.id, label: bundle.label,
        description: "Only tools available in this execution scope are included.", tools: await schemas(selected?.toolIds ?? []) });
    }
    case "get": {
      const toolId = input.toolId?.trim();
      if (!toolId || !available(toolId)) return formatLocalToolResult({
        action: "list-tools-get", toolId, errorCode: "tool_unavailable",
        ...(toolId && Object.hasOwn(catalog.tools, toolId) ? { operationPolicy: policy(toolId) } : {}),
      }, false, toolId ? "Tool is unavailable in the current execution scope." : "toolId is required when action=get", { retryable: false });
      return result({ action: "list-tools-get", ...(await schemas([toolId]))[0] });
    }
    default: return formatLocalToolResult({ action: "list-tools", errorCode: "invalid_catalog_action" }, false,
      "action must be index | routing | bundles | bundle | get");
  }
}

export { LIST_TOOLS_TOOL };
