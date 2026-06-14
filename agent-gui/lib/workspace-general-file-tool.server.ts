import { tool } from "ai";
import { z } from "zod";
import { formatLocalToolResult } from "@/lib/tool-result";
import {
  LEGACY_WORKSPACE_FILE_TOOL,
  READ_TOOL,
  STR_REPLACE_TOOL,
  WRITE_TOOL,
} from "@/lib/host-tool-constants";
import {
  readWorkspaceFileToolAction,
} from "@/lib/workspace-general-file-tool";
import {
  DEFAULT_READ_CHARS,
  editWorkspaceFile,
  getWorkspaceFileInfo,
  grepWorkspacePath,
  listWorkspaceFiles,
  readWorkspaceFile,
  readWorkspaceFileSnapshot,
  writeWorkspaceFile,
} from "@/lib/workspace-fs";

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

const actionSchema = z
  .enum(["read", "write", "edit", "info", "search", "list"])
  .describe(
    "read/write/edit/info/search/list under sidebar cwd; NOT Quicker program bodies (workspace_program).",
  );

const PROGRAM_BODY_PATH_RE =
  /^\.quicker\/(actions|subprograms)\/[^/]+\/(data\.json|files\/)/i;

function validateGeneralWorkspacePath(
  inputPath: string,
  mode: "read" | "write",
): { ok: true } | { ok: false; error: string } {
  const trimmed = inputPath.trim().replace(/\\/g, "/");
  if (!trimmed) {
    return { ok: false, error: "path is required." };
  }
  if (PROGRAM_BODY_PATH_RE.test(trimmed)) {
    return {
      ok: false,
      error:
        "Quicker program bodies under .quicker/actions or .quicker/subprograms "
        + "require workspace_program (read_data/file_*/patch), not workspace_file.",
    };
  }
  if (mode === "write" && trimmed.toLowerCase() === ".quicker") {
    return {
      ok: false,
      error: "do not write directly under .quicker/; use workspace_program or qkrpc tools.",
    };
  }
  return { ok: true };
}

type WorkspaceFileToolInput = {
  action: z.infer<typeof actionSchema>;
  path?: string;
  content?: string;
  oldString?: string;
  newString?: string;
  replaceAll?: boolean;
  query?: string;
  maxMatches?: number;
  caseInsensitive?: boolean;
  recursive?: boolean;
  offset?: number;
  limit?: number;
  startLine?: number;
  endLine?: number;
  maxLines?: number;
};

export {
  LEGACY_WORKSPACE_FILE_TOOL as WORKSPACE_FILE_TOOL,
  READ_TOOL,
  STR_REPLACE_TOOL,
  WRITE_TOOL,
} from "@/lib/host-tool-constants";

const readActionSchema = z
  .enum(["read", "list", "info", "search"])
  .optional()
  .describe("Default read. list/info/search for directory listing, metadata, or grep in tree.");

async function executeWorkspaceFileTool(
  input: WorkspaceFileToolInput,
): Promise<Record<string, unknown>> {
  const action = readWorkspaceFileToolAction(input) ?? input.action;

  switch (action) {
    case "read": {
      const path = input.path?.trim();
      if (!path) {
        return formatLocalToolResult(
          { action: "file-read", success: false, errorMessage: "path is required." },
          false,
          "path is required.",
        );
      }
      const guard = validateGeneralWorkspacePath(path, "read");
      if (!guard.ok) {
        return formatLocalToolResult(
          { action: "file-read", success: false, errorMessage: guard.error },
          false,
          guard.error,
        );
      }
      const result = await readWorkspaceFile(path, {
        offset: input.offset,
        limit: input.limit,
        startLine: input.startLine,
        endLine: input.endLine,
        maxLines: input.maxLines,
      });
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
        totalLines: result.totalLines,
        startLine: result.startLine,
        endLine: result.endLine,
        readHint: result.readHint,
      });
    }
    case "write": {
      const path = input.path?.trim();
      if (!path) {
        return formatLocalToolResult(
          { action: "file-write", success: false, errorMessage: "path is required." },
          false,
          "path is required.",
        );
      }
      if (input.content == null) {
        return formatLocalToolResult(
          { action: "file-write", success: false, errorMessage: "content is required." },
          false,
          "content is required.",
        );
      }
      const guard = validateGeneralWorkspacePath(path, "write");
      if (!guard.ok) {
        return formatLocalToolResult(
          { action: "file-write", success: false, errorMessage: guard.error },
          false,
          guard.error,
        );
      }
      const snapshot = await readWorkspaceFileSnapshot(path);
      const previousContent = snapshot.ok ? snapshot.content : "";
      const previousTruncated = snapshot.ok ? snapshot.truncated === true : false;
      const result = await writeWorkspaceFile(path, input.content);
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
        content: input.content,
        previousContent,
        previousTruncated: previousTruncated || undefined,
      });
    }
    case "edit": {
      const path = input.path?.trim();
      if (!path) {
        return formatLocalToolResult(
          { action: "file-edit", success: false, errorMessage: "path is required." },
          false,
          "path is required.",
        );
      }
      if (input.oldString == null || input.newString == null) {
        return formatLocalToolResult(
          {
            action: "file-edit",
            success: false,
            errorMessage: "oldString and newString are required.",
          },
          false,
          "oldString and newString are required.",
        );
      }
      const guard = validateGeneralWorkspacePath(path, "write");
      if (!guard.ok) {
        return formatLocalToolResult(
          { action: "file-edit", success: false, errorMessage: guard.error },
          false,
          guard.error,
        );
      }
      const snapshot = await readWorkspaceFileSnapshot(path);
      const previousContent = snapshot.ok ? snapshot.content : undefined;
      const result = await editWorkspaceFile(
        path,
        input.oldString,
        input.newString,
        input.replaceAll,
      );
      if (!result.ok) {
        return formatLocalToolResult(
          {
            action: "file-edit",
            success: false,
            errorMessage: result.error,
            matchCount: result.matchCount,
            matchLines: result.matchLines,
          },
          false,
          result.error,
        );
      }
      const written = await readWorkspaceFile(path, {});
      return formatLocalToolResult({
        action: "file-edit",
        success: true,
        path: result.path,
        replacements: result.replacements,
        matchLines: result.matchLines,
        editStrategy: result.editStrategy,
        previousContent,
        content: written.ok ? written.content : input.newString,
      });
    }
    case "info": {
      const path = input.path?.trim();
      if (!path) {
        return formatLocalToolResult(
          { action: "file-info", success: false, errorMessage: "path is required." },
          false,
          "path is required.",
        );
      }
      const guard = validateGeneralWorkspacePath(path, "read");
      if (!guard.ok) {
        return formatLocalToolResult(
          { action: "file-info", success: false, errorMessage: guard.error },
          false,
          guard.error,
        );
      }
      const result = await getWorkspaceFileInfo(path);
      if (!result.ok) {
        return formatLocalToolResult(
          { action: "file-info", success: false, errorMessage: result.error },
          false,
          result.error,
        );
      }
      return formatLocalToolResult({
        action: "file-info",
        success: true,
        ...result,
      });
    }
    case "search": {
      const path = input.path?.trim() ?? ".";
      const query = input.query?.trim();
      if (!query) {
        return formatLocalToolResult(
          { action: "file-search", success: false, errorMessage: "query is required." },
          false,
          "query is required.",
        );
      }
      const guard = validateGeneralWorkspacePath(path, "read");
      if (!guard.ok) {
        return formatLocalToolResult(
          { action: "file-search", success: false, errorMessage: guard.error },
          false,
          guard.error,
        );
      }
      const result = await grepWorkspacePath(path, query, {
        maxMatches: input.maxMatches,
        caseInsensitive: input.caseInsensitive,
        literal: true,
      });
      if (!result.ok) {
        return formatLocalToolResult(
          { action: "file-search", success: false, errorMessage: result.error },
          false,
          result.error,
        );
      }
      return formatLocalToolResult({
        action: "file-search",
        success: true,
        path: result.path,
        matches: result.matches,
        truncated: result.truncated,
        filesScanned: result.filesScanned,
      });
    }
    case "list": {
      const path = input.path?.trim() || ".";
      const guard = validateGeneralWorkspacePath(path, "read");
      if (!guard.ok) {
        return formatLocalToolResult(
          { action: "file-list", success: false, errorMessage: guard.error },
          false,
          guard.error,
        );
      }
      const result = await listWorkspaceFiles(path, {
        recursive: input.recursive,
      });
      if (!result.ok) {
        return formatLocalToolResult(
          { action: "file-list", success: false, errorMessage: result.error },
          false,
          result.error,
        );
      }
      return formatLocalToolResult({
        action: "file-list",
        success: true,
        path: result.path,
        entries: result.entries.map((entry) => {
          const segments = entry.path.replace(/\\/g, "/").split("/");
          const name = segments[segments.length - 1] ?? entry.path;
          return {
            name,
            path: entry.path,
            isDirectory: entry.kind === "directory",
          };
        }),
        truncated: result.truncated,
      });
    }
    default:
      return formatLocalToolResult(
        {
          action: String(action),
          success: false,
          errorMessage: "Unknown workspace_file action",
        },
        false,
        "Unknown workspace_file action",
      );
  }
}

export { executeWorkspaceFileTool };

const readWriteCommonSchema = {
  path: z
    .string()
    .optional()
    .describe("Path relative to workspace cwd (e.g. .local/out.txt, docs/foo.md)"),
  query: z.string().optional().describe("search: substring in file or directory tree"),
  maxMatches: z.number().int().min(1).max(50).optional().describe("search: max hits"),
  caseInsensitive: z.boolean().optional().describe("search: case insensitive"),
  recursive: z.boolean().optional().describe("list: include subdirectories"),
  ...workspaceReadSliceSchema,
};

export const READ_TOOL_DEF = tool({
  description:
    "Read plain files under sidebar workspace cwd. Prefer over Shell for file I/O. "
    + "Scratch/temp → `.local/` (gitignored). "
    + "NOT Quicker program bodies (.quicker/actions|subprograms) — use workspace_program. "
    + "NOT regex search across tree — use Grep. "
    + "NOT run/build/git — use Shell. "
    + "Examples: read file {path, startLine:1, endLine:40}; list dir {action:\"list\", path:\".\"}.",
  inputSchema: z.object({
    action: readActionSchema,
    ...readWriteCommonSchema,
  }),
  execute: async (input) =>
    executeWorkspaceFileTool({
      ...input,
      action: input.action ?? "read",
    }),
});

export const WRITE_TOOL_DEF = tool({
  description:
    "Write full content to a plain file under sidebar workspace cwd. Prefer over Shell for file I/O. "
    + "Scratch/temp → `.local/` (gitignored). Changes show in side panel 已改动. "
    + "NOT Quicker program bodies — use workspace_program. "
    + "For small in-file edits use StrReplace. "
    + "Example: {path:\".local/out.json\", content:\"…\"}.",
  inputSchema: z.object({
    path: readWriteCommonSchema.path,
    content: z.string().describe("Full file content"),
  }),
  execute: async (input) =>
    executeWorkspaceFileTool({ ...input, action: "write" }),
});

export const STR_REPLACE_TOOL_DEF = tool({
  description:
    "Replace exact text in a plain cwd file (oldString → newString). Prefer over Write for small patches. "
    + "Changes show in side panel 已改动. NOT Quicker program bodies — use workspace_program. "
    + "Example: {path:\".local/foo.txt\", oldString:\"a\", newString:\"b\", replaceAll:false}.",
  inputSchema: z.object({
    path: z
      .string()
      .describe("Path relative to workspace cwd (e.g. .local/foo.txt, docs/bar.md)"),
    oldString: z.string().min(1).describe("Exact text to find"),
    newString: z.string().describe("Replacement text (empty string deletes match)"),
    replaceAll: z.boolean().optional().describe("Replace all matches (default first only)"),
  }),
  execute: async (input) =>
    executeWorkspaceFileTool({ ...input, action: "edit" }),
});

export const WORKSPACE_FILE_TOOL_DEF = tool({
  description: "Deprecated: use Read, Write, or StrReplace.",
  inputSchema: z.object({
    action: actionSchema,
    path: readWriteCommonSchema.path,
    content: z.string().optional().describe("write: full file content"),
    oldString: z.string().optional().describe("edit: exact text to find"),
    newString: z.string().optional().describe("edit: replacement text"),
    replaceAll: z.boolean().optional().describe("edit: replace all matches"),
    query: readWriteCommonSchema.query,
    maxMatches: readWriteCommonSchema.maxMatches,
    caseInsensitive: readWriteCommonSchema.caseInsensitive,
    recursive: readWriteCommonSchema.recursive,
    ...workspaceReadSliceSchema,
  }),
  execute: async (input) => executeWorkspaceFileTool(input),
});
