import "server-only";

import { tool } from "ai";
import { z } from "zod";
import {
  DEFAULT_GREP_HEAD_LIMIT,
  MAX_GREP_HEAD_LIMIT,
} from "@/lib/grep-workspace-core";
import { grepWorkspace } from "@/lib/grep-workspace.server";
import { GREP_TOOL } from "@/lib/grep-tool";
import { formatLocalToolResult } from "@/lib/tool-result";

export { GREP_TOOL };

const grepOutputModeSchema = z.enum(["content", "files_with_matches", "count"]);

const grepInputSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .describe("Regular expression pattern (ripgrep syntax). Example: resolveWorkspacePath|class Foo"),
  path: z
    .string()
    .optional()
    .describe(
      "File or directory relative to workspace cwd (default \".\"). Example: agent-gui/lib",
    ),
  glob: z
    .string()
    .optional()
    .describe("Glob filter passed to rg --glob. Example: *.ts, *.{ts,tsx}"),
  type: z
    .string()
    .optional()
    .describe("Ripgrep --type shorthand (ts, rust, md, …) when glob is awkward"),
  output_mode: grepOutputModeSchema
    .optional()
    .describe("content (default): line matches; files_with_matches: paths only; count: per-file counts"),
  "-i": z.boolean().optional().describe("Case insensitive search"),
  multiline: z.boolean().optional().describe("Enable multiline mode (. matches newlines)"),
  "-A": z.number().int().min(0).optional().describe("Lines of context after each match"),
  "-B": z.number().int().min(0).optional().describe("Lines of context before each match"),
  "-C": z.number().int().min(0).optional().describe("Lines of context before and after each match"),
  head_limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_GREP_HEAD_LIMIT)
    .optional()
    .describe(`Max matches returned after offset (default ${DEFAULT_GREP_HEAD_LIMIT})`),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Skip first N matches (pagination)"),
});

export type GrepToolInput = z.infer<typeof grepInputSchema>;

export async function executeGrepTool(
  input: GrepToolInput,
): Promise<Record<string, unknown>> {
  const result = await grepWorkspace({
    pattern: input.pattern,
    path: input.path,
    glob: input.glob,
    type: input.type,
    outputMode: input.output_mode,
    caseInsensitive: input["-i"],
    multiline: input.multiline,
    contextBefore: input["-B"],
    contextAfter: input["-A"],
    context: input["-C"],
    headLimit: input.head_limit,
    offset: input.offset,
  });

  if (!result.ok) {
    return formatLocalToolResult(
      { action: "grep", success: false, errorMessage: result.error },
      false,
      result.error,
    );
  }

  return formatLocalToolResult({
    action: "grep",
    success: true,
    pattern: result.pattern,
    searchPath: result.searchPath,
    outputMode: result.outputMode,
    matches: result.matches,
    truncated: result.truncated,
    totalMatches: result.totalMatches,
    hint: result.truncated
      ? "More matches exist — increase head_limit or offset for pagination."
      : undefined,
  });
}

export const GREP_TOOL_DEF = tool({
  description:
    "Search file contents under sidebar workspace cwd with ripgrep (regex). "
    + "Prefer over Shell for code/symbol search. NOT for Quicker program bodies editing (workspace_program). "
    + "NOT literal single-file substring — use Read({ action: \"search\" }). "
    + "Example: { pattern: \"tool-registry\", glob: \"*.ts\", path: \"agent-gui/lib\" }.",
  inputSchema: grepInputSchema,
  execute: async (input) => executeGrepTool(input),
});
