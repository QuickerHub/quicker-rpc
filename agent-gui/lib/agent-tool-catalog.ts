import type { ToolSet } from "ai";

import type { ToolMeta } from "@/lib/tool-registry";

export type ToolCatalogDiagnostic = {
  toolId: string;
  message: string;
};

/** Validate the contract shared by the picker, prompt router and executable tools. */
export function validateAgentToolCatalog(
  registry: readonly ToolMeta[],
  tools: ToolSet,
): ToolCatalogDiagnostic[] {
  const diagnostics: ToolCatalogDiagnostic[] = [];
  const seen = new Set<string>();

  for (const meta of registry) {
    if (!meta.id.trim()) {
      diagnostics.push({ toolId: meta.id, message: "tool id is empty" });
      continue;
    }
    if (seen.has(meta.id)) {
      diagnostics.push({ toolId: meta.id, message: "tool id is duplicated" });
      continue;
    }
    seen.add(meta.id);

    const definition = tools[meta.id];
    if (!definition) {
      diagnostics.push({
        toolId: meta.id,
        message: "registered tool has no executable definition",
      });
      continue;
    }
    if (!meta.description?.trim()) {
      diagnostics.push({ toolId: meta.id, message: "registry description is empty" });
    }
    if (!(definition as { description?: string }).description?.trim()) {
      diagnostics.push({ toolId: meta.id, message: "model description is empty" });
    }
    if (!(definition as { inputSchema?: unknown }).inputSchema) {
      diagnostics.push({ toolId: meta.id, message: "input schema is missing" });
    }
  }

  for (const toolId of Object.keys(tools)) {
    if (!seen.has(toolId)) {
      diagnostics.push({
        toolId,
        message: "executable tool is missing registry metadata",
      });
    }
  }

  return diagnostics;
}

export function assertValidAgentToolCatalog(
  registry: readonly ToolMeta[],
  tools: ToolSet,
): void {
  const diagnostics = validateAgentToolCatalog(registry, tools);
  if (diagnostics.length === 0) return;
  throw new Error(
    `Invalid agent tool catalog:\n${diagnostics
      .map((item) => `- ${item.toolId || "<empty>"}: ${item.message}`)
      .join("\n")}`,
  );
}

