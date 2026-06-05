import { tool } from "ai";
import { z } from "zod";
import { formatQkrpcResultForAgent, runQkrpcForTool } from "@/lib/qkrpc";

export const QKRPC_FA_TOOL = "qkrpc_fa";

/** @deprecated Use qkrpc_fa action=search */
export const QKRPC_FA_SEARCH_TOOL = "qkrpc_fa_search";
/** @deprecated Use qkrpc_fa action=resolve */
export const QKRPC_FA_RESOLVE_TOOL = "qkrpc_fa_resolve";

const faActionSchema = z.enum(["search", "resolve"]);

export type QkrpcFaToolInput = {
  action: z.infer<typeof faActionSchema>;
  query?: string;
  limit?: number;
  expand?: boolean;
  spec?: string;
  specs?: string[];
};

export function isQkrpcFaTool(toolName: string): boolean {
  return (
    toolName === QKRPC_FA_TOOL
    || toolName === QKRPC_FA_SEARCH_TOOL
    || toolName === QKRPC_FA_RESOLVE_TOOL
  );
}

export function isFaSearchToolName(
  toolName: string,
  input?: unknown,
): boolean {
  if (toolName === QKRPC_FA_SEARCH_TOOL) return true;
  if (toolName !== QKRPC_FA_TOOL) return false;
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const action = (input as Record<string, unknown>).action;
    return action === "search" || action === undefined;
  }
  return false;
}

export async function executeQkrpcFaTool(
  input: QkrpcFaToolInput,
): Promise<Record<string, unknown>> {
  if (input.action === "search") {
    const args = ["fa", "search"];
    if (input.query) args.push("--query", input.query);
    if (input.limit != null) args.push("--limit", String(input.limit));
    if (input.expand) args.push("--expand");
    return formatQkrpcResultForAgent(await runQkrpcForTool(args));
  }

  const args = ["fa", "resolve"];
  if (input.specs?.length) {
    args.push("--specs", JSON.stringify(input.specs));
  } else if (input.spec) {
    args.push("--spec", input.spec);
  }
  return formatQkrpcResultForAgent(await runQkrpcForTool(args));
}

export const QKRPC_FA_TOOL_DEF = tool({
  description:
    "Font Awesome icons for action metadata. action=search: find fa:Light_* specs; "
    + "action=resolve: fa: spec → SVG path data.",
  inputSchema: z.object({
    action: faActionSchema,
    query: z.string().optional().describe("Search keyword for action=search"),
    limit: z.number().int().min(1).max(80).optional(),
    expand: z
      .boolean()
      .optional()
      .describe("All style rows (Solid/Regular/Light) for action=search"),
    spec: z.string().optional().describe("Single fa: spec for action=resolve"),
    specs: z
      .array(z.string())
      .optional()
      .describe("Batch resolve for action=resolve"),
  }),
  execute: executeQkrpcFaTool,
});
