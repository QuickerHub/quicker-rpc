"use client";
import type { InlineXActionProgram } from "./action-trace-inline-programs";
import { prepareManualTracePendingView, promoteManualTraceView } from "./action-trace-overlay";
import { startActionTraceFeed } from "./action-trace-feed-client";
import { readManualTraceAcknowledgement } from "./action-trace-manual-contract";
import type { ManualTracePresentationPort } from "./action-trace-presentation";

export type StartActionTraceOptions = {
  actionId: string; param?: string; actionTitle?: string; xaction?: InlineXActionProgram;
  presentation?: ManualTracePresentationPort;
};
export type StartActionTraceResult = { ok: true; presented: boolean } | { ok: false; error: string; presented: boolean };
/** Only an explicit user click calls POST. History and feed observers cannot start runs. */
export async function startActionTrace(options: StartActionTraceOptions): Promise<StartActionTraceResult> {
  const port = options.presentation;
  if (!port?.isCurrent()) return { ok: false, error: "调试需要当前可见会话与明确工作目录", presented: false };
  const actionId = options.actionId.trim();
  if (!actionId && !options.xaction) return { ok: false, error: "缺少动作 id 或内联程序", presented: true };
  const pending = prepareManualTracePendingView({ threadId: port.threadId, cwd: port.cwd, actionId: actionId || "inline", param: options.param,
    actionTitle: options.actionTitle ?? options.xaction?.title, inline: Boolean(options.xaction), focus: true });
  const abort = new AbortController();
  const releaseClose = pending.onClose(() => abort.abort(new Error("启动确认已关闭；若动作已派发，原生结果未知。")));
  try {
    const response = await fetch("/api/actions/trace/stream", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: abort.signal,
      body: JSON.stringify({ cwd: port.cwd, actionId, param: options.param, xaction: options.xaction, projectDirectory: port.projectDirectory }) });
    const value = await response.json() as { error?: string; code?: string; dispatchStatus?: string };
    if (!response.ok && value.dispatchStatus === "not-dispatched") {
      const message = value.error || "调试请求在派发前被拒绝";
      if (pending.isCurrent()) pending.finish({ ok: false, error: value.code, message, eventCount: 0 });
      return { ok: false, error: message, presented: pending.isCurrent() && port.isCurrent() };
    }
    const owner = readManualTraceAcknowledgement(value);
    if (!response.ok || !owner) throw new Error(value.error || "调试启动确认无效；原生结果未知，请勿自动重试。");
    if (owner.actionId !== actionId && !options.xaction || owner.param !== (options.param?.trim() || undefined))
      throw new Error("调试启动确认与原请求不一致；原生结果未知。");
    releaseClose();
    const view = promoteManualTraceView(pending, owner, port.isCurrent());
    if (view) startActionTraceFeed(owner, view);
    return { ok: true, presented: Boolean(view && port.isCurrent()) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (pending.isCurrent()) pending.observeError(`启动确认失败；原生结果未知，请勿自动重试。${message}`);
    return { ok: false, error: message, presented: pending.isCurrent() && port.isCurrent() };
  } finally { releaseClose(); }
}
