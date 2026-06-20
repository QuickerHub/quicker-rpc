import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { formatToolResultForAgent } from "@/lib/tool-result-agent-view";
import {
  executeListToolsTool,
  LIST_TOOLS_TOOL,
} from "@/lib/list-tools-tool-execute";

const listToolsActionSchema = z.enum([
  "index",
  "get",
  "routing",
  "bundles",
  "bundle",
]);

export const LIST_TOOLS_TOOL_DEF = tool({
  description:
    "Tool catalog (like skill index). action=bundles lists categorized packs; "
    + "action=bundle bundleId loads full schemas for a pack; action=get toolId for one tool; "
    + "action=routing for full intent table; action=index for flat catalog. "
    + "Core + auto-loaded packs already have full schemas — use this for layout/browser/delete/dev packs.",
  inputSchema: z.object({
    action: listToolsActionSchema.describe(
      "bundles | bundle | get | routing | index",
    ),
    toolId: z
      .string()
      .optional()
      .describe("Required for get — tool id (e.g. qkrpc_profile_create)"),
    bundleId: z
      .enum([
        "core",
        "action_authoring",
        "action_layout",
        "browser",
        "settings",
        "runtime_extras",
        "destructive",
        "dev",
      ])
      .optional()
      .describe("Required for bundle — pack id from action=bundles"),
  }),
  execute: async (input) =>
    formatToolResultForAgent(
      LIST_TOOLS_TOOL,
      input,
      await executeListToolsTool(input),
    ),
});

export { LIST_TOOLS_TOOL };
