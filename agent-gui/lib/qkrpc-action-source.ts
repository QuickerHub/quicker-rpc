/** Client-safe source bundle identity and status projection; no transport or codec. */
export const QKRPC_ACTION_OPEN_TOOL = "qkrpc_action_open";
export const QKRPC_ACTION_SAVE_TOOL = "qkrpc_action_save";

export function isActionSourceManagedPath(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, "/");
  return /(?:^|\/)quicker\.source\.json$/i.test(normalized)
    || /(?:^|\/)\.qkrpc\/baseline\.json$/i.test(normalized);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** CLI keeps the serve envelope; HTTP unwraps successful envelopes. Accept both. */
export function readActionSourceResult(data: unknown): {
  payload: Record<string, unknown>;
  errorCode?: string;
  message?: string;
} {
  const outer = record(data) ?? {};
  const payload = record(outer.data) ?? outer;
  const error = outer.error ?? outer.errorCode ?? payload.error ?? payload.errorCode;
  const message = outer.message ?? payload.message;
  return {
    payload,
    errorCode: typeof error === "string" ? error : undefined,
    message: typeof message === "string" ? message : undefined,
  };
}

export function actionSourceCommandVerb(toolName: string, input: unknown): string | undefined {
  if (toolName === QKRPC_ACTION_OPEN_TOOL) return "source_open";
  if (toolName !== QKRPC_ACTION_SAVE_TOOL) return undefined;
  return record(input)?.dryRun === true ? "source_validate" : "source_save";
}

export function actionSourceResultMeta(toolName: string, input: unknown, data: unknown, resultOk?: boolean): string | undefined {
  const verb = actionSourceCommandVerb(toolName, input);
  if (!verb) return undefined;
  const { payload, errorCode, message } = readActionSourceResult(data);
  if (payload.persisted === true && errorCode === "SOURCE_CHECKPOINT_FAILED") return "已写入动作 · 本地基线更新失败，勿重试";
  const outer = record(data);
  if (payload.persisted === true && (errorCode || verb === "source_validate" || resultOk === false || outer?.ok === false || payload.ok !== true || payload.dryRun === true)) {
    return "已写入动作 · 保存流程需核对，勿重试";
  }
  if (payload.versionConflict === true || errorCode === "EDIT_VERSION_CONFLICT") return "版本冲突 · 未保存";
  if (errorCode) return message ?? errorCode;
  if (resultOk === false) return message ?? "结果未确认 · 查看详情";
  if (verb === "source_validate" && payload.dryRun === true && payload.ok === true) return "校验通过 · 未写入动作";
  if (verb === "source_save") return payload.ok === true && payload.persisted === true ? "已保存 · 本地基线已更新" : "保存未确认 · 查看详情";
  if (verb === "source_open" && payload.ok === true && typeof payload.sourcePath === "string" && payload.sourcePath.length > 0) {
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const dir = record(input)?.dir;
    const source = typeof dir === "string" ? `${dir.replace(/\\/g, "/")}/program.source.yaml` : "V1 YAML 源码";
    return title ? `${title} · ${source}` : source;
  }
  return message ?? "结果未确认 · 查看详情";
}
