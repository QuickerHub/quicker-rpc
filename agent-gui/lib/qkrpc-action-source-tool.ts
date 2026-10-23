import { tool } from "ai";
import { z } from "zod";
import {
  attachToolFeedback,
  formatLocalToolResult,
  isStructuredToolResult,
  type StructuredToolResult,
  type ToolFeedback,
} from "@/lib/tool-result";
import { QKRPC_ACTION_OPEN_TOOL, QKRPC_ACTION_SAVE_TOOL, readActionSourceResult } from "@/lib/qkrpc-action-source";
import { isQkrpcConnectivityFailure } from "@/lib/qkrpc-connectivity";
export { QKRPC_ACTION_OPEN_TOOL, QKRPC_ACTION_SAVE_TOOL } from "@/lib/qkrpc-action-source";

export const actionSourceOpenSchema = z.object({
  id: z.string().uuid().describe("Existing local V1 action GUID; not a shared action ID or V2 action"),
  dir: z.string().trim().min(1).describe("New/empty directory inside sidebar cwd, e.g. .tmp/quicker/edit-action"),
  minLines: z.number().int().min(0).optional().describe("Externalize long text to files/ at this line count (default 4)"),
  noAutoFiles: z.boolean().optional().describe("Keep long text in YAML instead of auto-creating files/"),
}).strict();

export const actionSourceSaveSchema = z.object({
  dir: z.string().trim().min(1).describe("The same source bundle directory returned by qkrpc_action_open"),
  dryRun: z.boolean().describe("true: offline validation first; false: write original V1 action after successful validation"),
}).strict();

export type ActionSourceOpenInput = z.infer<typeof actionSourceOpenSchema>;
export type ActionSourceSaveInput = z.infer<typeof actionSourceSaveSchema>;

type SourceOperation = "open" | "save";
type SourceInput = ActionSourceOpenInput | ActionSourceSaveInput;
type SourceDirectory = { ok: true; absolute: string; relative: string } | { ok: false; error: string };

export type ActionSourceToolDependencies = {
  resolveDirectory: (directory: string, abortSignal?: AbortSignal) => SourceDirectory | Promise<SourceDirectory>;
  /** A proof for this turn only, used by the existing post-create/patch Read guard. */
  rememberDirectory?: (absoluteDirectory: string) => void;
  /** A single transport attempt: source writes must not be retried after an ambiguous timeout. */
  run: (args: string[], options: { abortSignal?: AbortSignal }) => Promise<Record<string, unknown>>;
};

function feedbackForSourceResult(
  operation: SourceOperation,
  input: SourceInput,
  result: StructuredToolResult,
): ToolFeedback {
  const { payload, errorCode, message } = readActionSourceResult(result.data);
  const dryRun = operation === "save" && "dryRun" in input && input.dryRun;
  const label = typeof payload.title === "string" && payload.title.trim() ? `“${payload.title.trim()}”` : "动作";
  if (operation === "save" && payload.persisted === true && !result.ok) {
    return {
      summary: errorCode === "SOURCE_CHECKPOINT_FAILED"
        ? "动作已写入 Quicker，但本地 checkpoint 更新失败；保留当前目录，另开新目录读取当前动作并核对，勿重试保存。"
        : "动作已写入 Quicker，但保存响应不完整或与请求不符；保留当前目录并核对当前动作，勿重试保存。",
      retryable: false,
      userDecisionRequired: true,
    };
  }
  if (!result.ok) {
    if (!dryRun && (payload.status === "connectivity_blocked" || isQkrpcConnectivityFailure({
      ok: result.ok, exitCode: result.exitCode, stdout: "", stderr: result.stderr ?? "",
      parsed: result.data, truncated: result.truncated ?? false,
    }))) {
      return {
        summary: "QuickerRpc 未连接；先调用 qkrpc_wait，再根据原工具结果决定是否恢复操作，勿用 Shell 探活。",
        retryable: false,
        nextActions: [{ tool: "qkrpc_wait", reason: "Restore the existing turn connectivity gate before any live source operation.", priority: "required" }],
      };
    }
    if (payload.versionConflict === true || errorCode === "EDIT_VERSION_CONFLICT") {
      return {
        summary: "动作版本冲突，未保存；保留编辑目录，另开新目录读取并合并修改，不能强制覆盖。",
        retryable: false,
        userDecisionRequired: true,
      };
    }
    return {
      summary: `${operation === "open" ? "打开源码失败" : dryRun ? "源码校验失败" : "保存未确认"}：${message ?? result.stderr ?? errorCode ?? "请检查完整工具结果"}${operation === "save" && !dryRun ? "；勿自动重复写入。" : ""}`,
      retryable: false,
    };
  }
  if (operation === "open") {
    return {
      summary: `已打开${label}的 V1 YAML 源码。只编辑 program.source.yaml 与 files/；保留 quicker.source.json 和 .qkrpc/baseline.json。`,
      retryable: false,
      nextActions: [{
        tool: "Read", input: { path: `${input.dir}/program.source.yaml` },
        reason: "Read the opened YAML before editing; preserve unrelated content and tool-managed sidecars.",
        priority: "recommended",
      }],
    };
  }
  if (dryRun) {
    return {
      summary: "V1 YAML 源码校验通过；未写入 Quicker，也未更新本地基线。需要保存时显式 dryRun=false。",
      retryable: false,
      nextActions: [{
        tool: QKRPC_ACTION_SAVE_TOOL, input: { dir: input.dir, dryRun: false },
        reason: "Offline validation passed; save the intended changes to the original V1 action.",
        priority: "recommended",
      }],
    };
  }
  return {
    summary: "V1 动作已保存，本地基线已更新；可继续编辑同一目录，运行行为按需用 debug/trace 验证。",
    retryable: false,
  };
}

export function formatActionSourceToolResult(
  operation: SourceOperation,
  input: SourceInput,
  result: Record<string, unknown>,
): Record<string, unknown> {
  if (!isStructuredToolResult(result)) return result;
  const { payload } = readActionSourceResult(result.data);
  const confirmed = payload.ok === true && (operation === "open"
    ? typeof payload.sourcePath === "string" && payload.sourcePath.length > 0
    : "dryRun" in input && input.dryRun
      ? payload.dryRun === true && payload.persisted !== true
      : payload.dryRun !== true && payload.persisted === true);
  const missingConfirmation = result.ok && !confirmed;
  const confirmedResult = missingConfirmation
    ? { ...result, ok: false, exitCode: 1, stderr: `Source ${operation} response did not confirm the requested operation.` }
    : result;
  return attachToolFeedback(confirmedResult, feedbackForSourceResult(operation, input, confirmedResult));
}

export function createQkrpcActionSourceTools(dependencies: ActionSourceToolDependencies) {
  const execute = async (operation: SourceOperation, input: SourceInput, abortSignal?: AbortSignal) => {
    abortSignal?.throwIfAborted();
    const parsed = operation === "open" ? actionSourceOpenSchema.safeParse(input) : actionSourceSaveSchema.safeParse(input);
    if (!parsed.success) {
      return formatLocalToolResult({ errorCode: "invalid_source_input" }, false, parsed.error.message, { retryable: false });
    }
    const resolved = await dependencies.resolveDirectory(input.dir, abortSignal);
    abortSignal?.throwIfAborted();
    if (!resolved.ok || !resolved.relative || /^\.quicker(?:\/|$)/i.test(resolved.relative)) {
      return formatLocalToolResult(
        { errorCode: "source_directory_invalid", dir: input.dir }, false,
        !resolved.ok ? resolved.error : "Use a source subdirectory inside cwd outside the legacy .quicker/ tree, e.g. .tmp/quicker/edit-action.",
        { retryable: false },
      );
    }
    const args = ["action", operation, "--dir", resolved.absolute];
    if (operation === "open" && "id" in input) {
      args.push("--id", input.id);
      if (input.minLines != null) args.push("--min-lines", String(input.minLines));
      if (input.noAutoFiles) args.push("--no-auto-files");
    } else if ("dryRun" in input && input.dryRun) args.push("--dry-run");
    const result = await dependencies.run(args, { abortSignal });
    abortSignal?.throwIfAborted();
    const formatted = formatActionSourceToolResult(operation, { ...input, dir: resolved.relative }, result);
    if (isStructuredToolResult(formatted) && formatted.ok
      && (operation === "open" || ("dryRun" in input && input.dryRun))) {
      dependencies.rememberDirectory?.(resolved.absolute);
    }
    return formatted;
  };
  return {
    [QKRPC_ACTION_OPEN_TOOL]: tool({
      description: "Open an existing V1 action into a new/empty YAML source bundle inside sidebar cwd. Writes files, so Agent mode only. "
        + "Then Read/StrReplace/Write program.source.yaml and files/, save dryRun=true, then dryRun=false. "
        + "Preserve quicker.source.json and .qkrpc/baseline.json; no directory overwrite. V2, new actions, metadata and global subprograms use their existing tools.",
      inputSchema: actionSourceOpenSchema,
      execute: async (input, options) => execute("open", input, options.abortSignal),
    }),
    [QKRPC_ACTION_SAVE_TOOL]: tool({
      description: "Validate or save a V1 YAML action bundle opened by qkrpc_action_open. Explicit dryRun=true first (offline, no writes); "
        + "dryRun=false saves the original action and updates its checkpoint. No force: version conflict or open Designer blocks save. "
        + "If persisted=true but checkpoint failed, do not retry: preserve edits and reopen into another directory. Never edits V2/new actions/global subprograms or publishes shares.",
      inputSchema: actionSourceSaveSchema,
      execute: async (input, options) => execute("save", input, options.abortSignal),
    }),
  };
}
