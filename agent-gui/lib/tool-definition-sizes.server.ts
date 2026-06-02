import { asSchema } from "@ai-sdk/provider-utils";
import { ALL_QKRPC_TOOL_IDS } from "@/lib/tool-registry";
import { quickerTools } from "@/lib/tools";

export type ToolDefinitionSizeMap = Record<string, number>;

let cachedSizes: ToolDefinitionSizeMap | null = null;

/** Serialized OpenAI-style function tool payload length (name + description + jsonSchema). */
export async function measureToolDefinitionCharSizes(): Promise<ToolDefinitionSizeMap> {
  if (cachedSizes) return cachedSizes;

  const sizes: ToolDefinitionSizeMap = {};

  for (const id of ALL_QKRPC_TOOL_IDS) {
    const entry = quickerTools[id as keyof typeof quickerTools];
    if (!entry) continue;

    const schema = await asSchema(entry.inputSchema).jsonSchema;
    const payload = {
      type: "function" as const,
      name: id,
      description: entry.description,
      parameters: schema,
    };
    sizes[id] = JSON.stringify(payload).length;
  }

  cachedSizes = sizes;
  return sizes;
}

export function sumToolDefinitionChars(
  enabledToolIds: string[],
  sizes: ToolDefinitionSizeMap,
): number {
  let total = 0;
  for (const id of enabledToolIds) {
    total += sizes[id] ?? 0;
  }
  return total;
}
