import {
  isFormSpecFilePath,
  prepareFormSpecFileContentForWrite,
} from "@/lib/action-editor/steps/paramEditors/formSpecModel";
import { listWorkspaceActionProjects } from "@/lib/action-explorer-server";
import {
  getProgramProjectDataSummary,
  listWorkspaceSubProgramProjects,
  saveProgramFromWorkspace,
} from "@/lib/subprogram-project-workflow";
import { attachToolFeedback, formatLocalToolResult } from "@/lib/tool-result";
import {
  markProgramDataEditedThisTurn,
  markProgramPatchedThisTurn,
  mustWriteDataAfterCreateThisTurn,
  incrementProgramEditAfterPatchCount,
  wasActionCreatedThisTurn,
  wasProgramPatchedThisTurn,
} from "@/lib/program-turn-context";
import { groupMatchesByPath } from "@/lib/search-match-grouping";
import {
  editWorkspaceFile,
  getWorkspaceFileInfo,
  grepWorkspacePath,
  readWorkspaceFile,
  readWorkspaceFileSnapshot,
  writeWorkspaceFile,
} from "@/lib/workspace-fs";
import {
  parseWorkspaceProgramTarget,
  type ParsedWorkspaceProgramInput,
} from "@/lib/workspace-program-target";
import {
  formatProgramAutoSyncedNote,
  programProjectFileToolSuccess,
  resolveWorkspaceProgramDataForTool,
  resolveWorkspaceProgramFileForTool,
  resolveWorkspaceProgramFilesScopeForTool,
} from "@/lib/workspace-program-resolve.server";
import { scheduleProgramSyntaxLint } from "@/lib/program-syntax-lint";
import {
  buildValuePrefixWarningFields,
} from "@/lib/program-value-prefix-guard";
import {
  scanProgramValuePrefixWarnings,
} from "@/lib/quicker-interpolation-lint";
import { isStructuredToolResult } from "@/lib/tool-result";
import { readFile } from "node:fs/promises";

type ReadSlice = {
  offset?: number;
  limit?: number;
  startLine?: number;
  endLine?: number;
  maxLines?: number;
};

function formatMustWriteDataAfterCreateFeedback(
  input: ParsedWorkspaceProgramInput,
  blockedAction: "read_data" | "patch",
): Record<string, unknown> {
  const message =
    blockedAction === "patch"
      ? "Cannot patch empty data.json immediately after create — write steps via write_data first."
      : "Skip read_data after create — empty data.json is already known; use write_data next.";
  return attachToolFeedback(
    formatLocalToolResult(
      {
        action: blockedAction === "patch" ? "program-patch" : "program-data-read",
        success: false,
        errorMessage: message,
      },
      false,
      message,
    ),
    {
      summary: message,
      retryable: false,
      nextActions: [
        {
          tool: "workspace_program",
          priority: "required",
          reason: "Write steps into empty data.json before patch.",
          input: {
            action: "write_data",
            target: input.target,
            id: input.id,
            subProgramId: input.subProgramId,
          },
        },
      ],
    },
  );
}

function formatSkipReadGoPatchAfterCreateFeedback(
  input: ParsedWorkspaceProgramInput,
): Record<string, unknown> {
  const message =
    "Create already wrote data.json — patch next to save to Quicker; skip read_data.";
  return attachToolFeedback(
    formatLocalToolResult(
      {
        action: "program-data-read",
        success: false,
        errorMessage: message,
      },
      false,
      message,
    ),
    {
      summary: message,
      retryable: false,
      nextActions: [
        {
          tool: "workspace_program",
          priority: "required",
          reason: "Save created program body to Quicker.",
          input: {
            action: "patch",
            target: input.target,
            id: input.id,
            subProgramId: input.subProgramId,
          },
        },
      ],
    },
  );
}

function blockReadDataAfterCreate(
  input: ParsedWorkspaceProgramInput,
): Record<string, unknown> | null {
  if (!wasActionCreatedThisTurn() || wasProgramPatchedThisTurn()) {
    return null;
  }
  if (mustWriteDataAfterCreateThisTurn()) {
    return formatMustWriteDataAfterCreateFeedback(input, "read_data");
  }
  return formatSkipReadGoPatchAfterCreateFeedback(input);
}

function blockExcessiveEditAfterPatch(
  input: ParsedWorkspaceProgramInput,
  diskAction: "edit_data" | "write_data",
  editCountAfterPatch: number,
): Record<string, unknown> | null {
  if (editCountAfterPatch < 3) {
    return null;
  }
  const message =
    "Too many data.json edits after patch — run qkrpc_action_debug, fix only if needed, then patch once.";
  return attachToolFeedback(
    formatLocalToolResult(
      {
        action: diskAction === "edit_data" ? "program-data-edit" : "program-data-write",
        success: false,
        errorMessage: message,
      },
      false,
      message,
    ),
    {
      summary: message,
      retryable: false,
      nextActions: [
        {
          tool: "qkrpc_action_debug",
          priority: "required",
          reason: "Verify runtime behavior before more disk edits.",
          input: { id: input.id },
        },
      ],
    },
  );
}

function attachEditAfterPatchHintIfNeeded(
  response: Record<string, unknown>,
  editCountAfterPatch: number,
): Record<string, unknown> {
  if (
    editCountAfterPatch < 2
    || !wasProgramPatchedThisTurn()
    || !isStructuredToolResult(response)
    || !response.ok
  ) {
    return response;
  }
  return attachToolFeedback(response, {
    summary:
      `${editCountAfterPatch} data.json edits after patch — prefer qkrpc_action_debug over edit loops.`,
    retryable: false,
  });
}

function blockReadDataAfterPatch(
  input: ParsedWorkspaceProgramInput,
): Record<string, unknown> | null {
  if (!wasProgramPatchedThisTurn()) {
    return null;
  }
  const message =
    "read_data after patch is unnecessary — use diagnostics or qkrpc_action_debug instead.";
  return attachToolFeedback(
    formatLocalToolResult(
      {
        action: "program-data-read",
        success: false,
        errorMessage: message,
      },
      false,
      message,
    ),
    {
      summary: message,
      retryable: false,
      nextActions: [
        {
          tool: "qkrpc_action_debug",
          priority: "recommended",
          reason: "Verify program behavior after patch.",
          input: { id: input.id },
        },
      ],
    },
  );
}

export async function executeWorkspaceProgramReadData(
  input: ParsedWorkspaceProgramInput & ReadSlice & { mode?: "content" | "summary" },
): Promise<Record<string, unknown>> {
  const blocked = blockReadDataAfterCreate(input);
  if (blocked) {
    return blocked;
  }
  const blockedAfterPatch = blockReadDataAfterPatch(input);
  if (blockedAfterPatch) {
    return blockedAfterPatch;
  }

  if (input.mode === "summary") {
    const parsed = parseWorkspaceProgramTarget(input);
    if (!parsed.ok) {
      return formatLocalToolResult(
        { action: "program-data-summary", success: false, errorMessage: parsed.error },
        false,
        parsed.error,
      );
    }
    const result = await getProgramProjectDataSummary(parsed.target);
    if (!result.ok) {
      return formatLocalToolResult(
        {
          action: "program-data-summary",
          success: false,
          errorMessage: result.error,
        },
        false,
        result.error,
      );
    }
    return formatLocalToolResult({
      action: "program-data-summary",
      success: true,
      ...result.summary,
    });
  }

  const resolved = await resolveWorkspaceProgramDataForTool(input);
  if (!resolved.ok) {
    return formatLocalToolResult(
      { action: "program-data-read", success: false, errorMessage: resolved.error },
      false,
      resolved.error,
    );
  }

  const result = await readWorkspaceFile(resolved.resolved.path, {
    offset: input.offset,
    limit: input.limit,
    startLine: input.startLine,
    endLine: input.endLine,
    maxLines: input.maxLines,
  });
  if (!result.ok) {
    return formatLocalToolResult(
      { action: "program-data-read", success: false, errorMessage: result.error },
      false,
      result.error,
    );
  }

  const syncNote = formatProgramAutoSyncedNote(resolved.autoSynced);
  const base = formatLocalToolResult({
    action: "program-data-read",
    success: true,
    target: resolved.resolved.target.kind,
    primaryId: resolved.resolved.primaryId,
    parentActionId: resolved.resolved.parentActionId,
    projectDir: resolved.resolved.projectDir,
    path: result.path,
    content: result.content,
    truncated: result.truncated,
    totalChars: result.totalChars,
    totalLines: result.totalLines,
    startLine: result.startLine,
    endLine: result.endLine,
    readHint: result.readHint,
    ...(syncNote ? { workspaceSyncNote: syncNote } : {}),
  });

  return base;
}

export async function executeWorkspaceProgramWriteData(
  input: ParsedWorkspaceProgramInput & { content: string; contentNormalized?: boolean },
): Promise<Record<string, unknown>> {
  const editCountAfterPatch = wasProgramPatchedThisTurn()
    ? incrementProgramEditAfterPatchCount()
    : 0;
  const editGuard = blockExcessiveEditAfterPatch(input, "write_data", editCountAfterPatch);
  if (editGuard) {
    return editGuard;
  }

  const resolved = await resolveWorkspaceProgramDataForTool(input);
  if (!resolved.ok) {
    return formatLocalToolResult(
      { action: "program-data-write", success: false, errorMessage: resolved.error },
      false,
      resolved.error,
    );
  }

  const snapshot = await readWorkspaceFileSnapshot(resolved.resolved.path);
  const previousContent = snapshot.ok ? snapshot.content : "";
  const previousTruncated = snapshot.ok ? snapshot.truncated === true : false;

  const result = await writeWorkspaceFile(resolved.resolved.path, input.content);
  if (!result.ok) {
    return formatLocalToolResult(
      { action: "program-data-write", success: false, errorMessage: result.error },
      false,
      result.error,
    );
  }

  const parsed = parseWorkspaceProgramTarget(input);
  const summaryResult =
    parsed.ok ? await getProgramProjectDataSummary(parsed.target) : null;
  const syncNote = formatProgramAutoSyncedNote(resolved.autoSynced);
  const prefixWarnings = scanProgramValuePrefixWarnings(input.content);

  const response = formatLocalToolResult({
    action: "program-data-write",
    success: true,
    target: resolved.resolved.target.kind,
    primaryId: resolved.resolved.primaryId,
    parentActionId: resolved.resolved.parentActionId,
    projectDir: resolved.resolved.projectDir,
    path: result.path,
    bytesWritten: result.bytesWritten,
    previousContent,
    previousTruncated: previousTruncated || undefined,
    projectSummary: summaryResult?.ok ? summaryResult.summary : undefined,
    ...(syncNote ? { workspaceSyncNote: syncNote } : {}),
    ...buildValuePrefixWarningFields(prefixWarnings),
  });
  maybeScheduleSyntaxLintAfterDiskEdit(input, response);
  markProgramDataEditedThisTurn();
  const withHint = attachEditAfterPatchHintIfNeeded(response, editCountAfterPatch);
  if (!input.contentNormalized || !isStructuredToolResult(withHint) || !withHint.ok) {
    return withHint;
  }
  return attachToolFeedback(withHint, {
    summary:
      "Program data object normalized to wire shape (key/varType/default, stepRunnerKey/inputParams).",
    retryable: false,
  });
}

export async function executeWorkspaceProgramEditData(
  input: ParsedWorkspaceProgramInput & {
    oldString: string;
    newString: string;
    replaceAll?: boolean;
  },
): Promise<Record<string, unknown>> {
  const editCountAfterPatch = wasProgramPatchedThisTurn()
    ? incrementProgramEditAfterPatchCount()
    : 0;
  const editGuard = blockExcessiveEditAfterPatch(input, "edit_data", editCountAfterPatch);
  if (editGuard) {
    return editGuard;
  }

  const resolved = await resolveWorkspaceProgramDataForTool(input);
  if (!resolved.ok) {
    return formatLocalToolResult(
      { action: "program-data-edit", success: false, errorMessage: resolved.error },
      false,
      resolved.error,
    );
  }

  const result = await editWorkspaceFile(
    resolved.resolved.path,
    input.oldString,
    input.newString,
    input.replaceAll,
  );
  if (!result.ok) {
    return formatLocalToolResult(
      {
        action: "program-data-edit",
        success: false,
        errorMessage: result.error,
        matchCount: result.matchCount,
        matchLines: result.matchLines,
      },
      false,
      result.error,
    );
  }

  const parsed = parseWorkspaceProgramTarget(input);
  const summaryResult =
    parsed.ok ? await getProgramProjectDataSummary(parsed.target) : null;
  const syncNote = formatProgramAutoSyncedNote(resolved.autoSynced);

  let prefixWarnings: ReturnType<typeof scanProgramValuePrefixWarnings> = [];
  try {
    const raw = await readFile(resolved.resolved.path, "utf8");
    prefixWarnings = scanProgramValuePrefixWarnings(raw);
  } catch {
    /* ignore read errors; edit already succeeded */
  }
  const response = formatLocalToolResult({
    action: "program-data-edit",
    success: true,
    target: resolved.resolved.target.kind,
    primaryId: resolved.resolved.primaryId,
    parentActionId: resolved.resolved.parentActionId,
    projectDir: resolved.resolved.projectDir,
    path: result.path,
    replacements: result.replacements,
    matchLines: result.matchLines,
    editStrategy: result.editStrategy,
    projectSummary: summaryResult?.ok ? summaryResult.summary : undefined,
    ...(syncNote ? { workspaceSyncNote: syncNote } : {}),
    ...buildValuePrefixWarningFields(prefixWarnings),
  });
  maybeScheduleSyntaxLintAfterDiskEdit(input, response);
  markProgramDataEditedThisTurn();
  return attachEditAfterPatchHintIfNeeded(response, editCountAfterPatch);
}

export async function executeWorkspaceProgramFileInfo(
  input: ParsedWorkspaceProgramInput & { path: string },
): Promise<Record<string, unknown>> {
  const resolved = await resolveWorkspaceProgramFileForTool(input, input.path);
  if (!resolved.ok) {
    return formatLocalToolResult(
      { action: "file-info", success: false, errorMessage: resolved.error },
      false,
      resolved.error,
    );
  }
  const info = await getWorkspaceFileInfo(resolved.resolved.path);
  if (!info.ok) {
    return formatLocalToolResult(
      { action: "file-info", success: false, errorMessage: info.error },
      false,
      info.error,
    );
  }
  return formatLocalToolResult(
    programProjectFileToolSuccess("file-info", resolved.resolved, {
      sizeBytes: info.sizeBytes,
      lineCount: info.lineCount,
      lineCountCapped: info.lineCountCapped,
      exceedsEditLimit: info.exceedsEditLimit,
      readRecommended: info.readRecommended,
    }),
  );
}

export async function executeWorkspaceProgramFileSearch(
  input: ParsedWorkspaceProgramInput & {
    path?: string;
    query: string;
    maxMatches?: number;
    caseInsensitive?: boolean;
  },
): Promise<Record<string, unknown>> {
  const resolved = await resolveWorkspaceProgramFilesScopeForTool(input, input.path);
  if (!resolved.ok) {
    return formatLocalToolResult(
      { action: "file-search", success: false, errorMessage: resolved.error },
      false,
      resolved.error,
    );
  }
  const result = await grepWorkspacePath(resolved.resolved.path, input.query, {
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
  return formatLocalToolResult(
    programProjectFileToolSuccess("file-search", resolved.resolved, {
      matches: groupMatchesByPath(result.matches, (match) => ({
        line: match.line,
        column: match.column,
        lineText: match.lineText,
      })),
      truncated: result.truncated,
      filesScanned: result.filesScanned,
    }),
  );
}

export async function executeWorkspaceProgramFileRead(
  input: ParsedWorkspaceProgramInput & ReadSlice & { path: string },
): Promise<Record<string, unknown>> {
  const resolved = await resolveWorkspaceProgramFileForTool(input, input.path);
  if (!resolved.ok) {
    return formatLocalToolResult(
      { action: "file-read", success: false, errorMessage: resolved.error },
      false,
      resolved.error,
    );
  }
  const result = await readWorkspaceFile(resolved.resolved.path, {
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
  return formatLocalToolResult(
    programProjectFileToolSuccess("file-read", resolved.resolved, {
      content: result.content,
      truncated: result.truncated,
      totalChars: result.totalChars,
      totalLines: result.totalLines,
      startLine: result.startLine,
      endLine: result.endLine,
      readHint: result.readHint,
    }),
  );
}

export async function executeWorkspaceProgramFileWrite(
  input: ParsedWorkspaceProgramInput & { path: string; content: string },
): Promise<Record<string, unknown>> {
  const resolved = await resolveWorkspaceProgramFileForTool(input, input.path);
  if (!resolved.ok) {
    return formatLocalToolResult(
      { action: "file-write", success: false, errorMessage: resolved.error },
      false,
      resolved.error,
    );
  }

  let content = input.content;
  let reformatted = false;
  if (isFormSpecFilePath(resolved.resolved.path)) {
    const prepared = prepareFormSpecFileContentForWrite(content);
    if (!prepared.ok) {
      return formatLocalToolResult(
        { action: "file-write", success: false, errorMessage: prepared.error },
        false,
        prepared.error,
      );
    }
    content = prepared.content;
    reformatted = prepared.reformatted;
  }

  const snapshot = await readWorkspaceFileSnapshot(resolved.resolved.path);
  const previousContent = snapshot.ok ? snapshot.content : "";
  const previousTruncated = snapshot.ok ? snapshot.truncated === true : false;

  const result = await writeWorkspaceFile(resolved.resolved.path, content);
  if (!result.ok) {
    return formatLocalToolResult(
      { action: "file-write", success: false, errorMessage: result.error },
      false,
      result.error,
    );
  }

  const response = formatLocalToolResult(
    programProjectFileToolSuccess("file-write", resolved.resolved, {
      bytesWritten: result.bytesWritten,
      previousContent,
      previousTruncated: previousTruncated || undefined,
      content,
      reformatted,
    }),
  );
  maybeScheduleSyntaxLintAfterDiskEdit(input, response);
  return response;
}

export async function executeWorkspaceProgramFileEdit(
  input: ParsedWorkspaceProgramInput & {
    path: string;
    oldString: string;
    newString: string;
    replaceAll?: boolean;
  },
): Promise<Record<string, unknown>> {
  const resolved = await resolveWorkspaceProgramFileForTool(input, input.path);
  if (!resolved.ok) {
    return formatLocalToolResult(
      { action: "file-edit", success: false, errorMessage: resolved.error },
      false,
      resolved.error,
    );
  }

  const snapshot = await readWorkspaceFileSnapshot(resolved.resolved.path);
  const previousContent = snapshot.ok ? snapshot.content : "";

  const result = await editWorkspaceFile(
    resolved.resolved.path,
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

  let content = previousContent;
  let reformatted = false;
  if (isFormSpecFilePath(resolved.resolved.path)) {
    const readBack = await readWorkspaceFile(resolved.resolved.path, {});
    if (readBack.ok) {
      const prepared = prepareFormSpecFileContentForWrite(readBack.content);
      if (prepared.ok && prepared.reformatted) {
        const rewrite = await writeWorkspaceFile(resolved.resolved.path, prepared.content);
        if (!rewrite.ok) {
          return formatLocalToolResult(
            { action: "file-edit", success: false, errorMessage: rewrite.error },
            false,
            rewrite.error,
          );
        }
        content = prepared.content;
        reformatted = true;
      }
    }
  } else {
    const readBack = await readWorkspaceFile(resolved.resolved.path, {});
    if (readBack.ok) content = readBack.content;
  }

  const response = formatLocalToolResult(
    programProjectFileToolSuccess("file-edit", resolved.resolved, {
      replacements: result.replacements,
      matchLines: result.matchLines,
      previousContent,
      content,
      reformatted,
    }),
  );
  maybeScheduleSyntaxLintAfterDiskEdit(input, response);
  return response;
}

export async function executeWorkspaceProgramProjects(input?: {
  target?: "action" | "global_subprogram" | "all";
}): Promise<Record<string, unknown>> {
  const filter = input?.target ?? "all";
  const actions =
    filter === "global_subprogram"
      ? null
      : await listWorkspaceActionProjects();
  const subprograms =
    filter === "action" ? null : await listWorkspaceSubProgramProjects();

  if (actions && !actions.ok) {
    return formatLocalToolResult(
      { action: "program-projects", success: false, errorMessage: actions.error },
      false,
      actions.error,
    );
  }
  if (subprograms && !subprograms.ok) {
    return formatLocalToolResult(
      { action: "program-projects", success: false, errorMessage: subprograms.error },
      false,
      subprograms.error,
    );
  }

  return formatLocalToolResult({
    action: "program-projects",
    success: true,
    actions: actions
      ? { root: actions.root, count: actions.projects.length, projects: actions.projects }
      : undefined,
    globalSubprograms: subprograms
      ? {
          root: subprograms.root,
          count: subprograms.projects.length,
          projects: subprograms.projects,
        }
      : undefined,
  });
}

export async function executeWorkspaceProgramPatch(
  input: ParsedWorkspaceProgramInput & { force?: boolean },
): Promise<Record<string, unknown>> {
  const parsed = parseWorkspaceProgramTarget(input);
  if (!parsed.ok) {
    return formatLocalToolResult(
      { action: "program-patch", success: false, errorMessage: parsed.error },
      false,
      parsed.error,
    );
  }

  if (mustWriteDataAfterCreateThisTurn()) {
    const summary = await getProgramProjectDataSummary(parsed.target);
    if (summary.ok && (summary.summary.stepCount ?? 0) === 0) {
      return formatMustWriteDataAfterCreateFeedback(input, "patch");
    }
  }

  const result = await saveProgramFromWorkspace(parsed.target, { force: input.force });
  maybeScheduleSyntaxLintAfterPatch(parsed.target, result);
  markProgramPatchedThisTurn();
  return attachToolFeedback(result, {
    summary:
      "Program patch saved — run diagnostics or qkrpc_action_debug next; do NOT read_data to verify.",
    nextActions: [
      {
        tool: "workspace_program",
        priority: "required",
        reason: "Verify patched program body for syntax issues.",
        input: {
          action: "diagnostics",
          target: input.target,
          id: input.id,
          subProgramId: input.subProgramId,
          waitMs: 30000,
        },
      },
      {
        tool: "qkrpc_action_debug",
        priority: "recommended",
        reason: "Alternative: run with trace when step output matters.",
        input: { id: input.id },
      },
    ],
  });
}

function maybeScheduleSyntaxLintAfterPatch(
  target: import("@/lib/workspace-program-target").WorkspaceProgramTarget,
  result: Record<string, unknown>,
): void {
  if (!isStructuredToolResult(result) || !result.ok) {
    return;
  }

  const data = result.data;
  if (typeof data !== "object" || data === null) {
    return;
  }

  const record = data as Record<string, unknown>;
  if (record.success === false || record.ok === false) {
    return;
  }

  const editVersion =
    typeof record.editVersion === "number" ? record.editVersion : undefined;

  scheduleProgramSyntaxLint({ target, editVersion });
}

function maybeScheduleSyntaxLintAfterDiskEdit(
  input: ParsedWorkspaceProgramInput,
  result: Record<string, unknown>,
): void {
  if (!isStructuredToolResult(result) || !result.ok) {
    return;
  }

  const parsed = parseWorkspaceProgramTarget(input);
  if (!parsed.ok) {
    return;
  }

  const data = result.data;
  if (typeof data !== "object" || data === null) {
    return;
  }

  const record = data as Record<string, unknown>;
  if (record.success === false) {
    return;
  }

  const summary =
    typeof record.projectSummary === "object" && record.projectSummary !== null
      ? (record.projectSummary as Record<string, unknown>)
      : null;
  const editVersion =
    typeof summary?.editVersion === "number" ? summary.editVersion : undefined;

  scheduleProgramSyntaxLint({ target: parsed.target, editVersion });
}
