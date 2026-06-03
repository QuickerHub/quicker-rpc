"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionProjectSyncState } from "@/lib/action-project-sync-types";
import {
  fetchActionProjectSyncStatus,
  pullActionProjectFromQuicker,
  pushActionProjectToQuickerApi,
} from "@/lib/action-project-sync-client";

type ActionProjectSyncBarProps = {
  cwd: string;
  actionId: string;
  /** Relative `.quicker/actions/...` for extract into an existing title-named folder. */
  projectDirectory?: string;
  /** Block pull/push while info.json title/description edits are unsaved. */
  blocked?: boolean;
  blockReason?: string;
  onSynced?: () => void;
};

function stateClassName(state: ActionProjectSyncState | null): string {
  if (!state) return "";
  return ` project-info-sync-status--${state.replace(/_/g, "-")}`;
}

export function ActionProjectSyncBar({
  cwd,
  actionId,
  projectDirectory,
  blocked = false,
  blockReason,
  onSynced,
}: ActionProjectSyncBarProps) {
  const [busy, setBusy] = useState<"status" | "pull" | "push" | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [statusErr, setStatusErr] = useState(false);
  const [syncState, setSyncState] = useState<ActionProjectSyncState | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runStatusCheck = useCallback(async () => {
    if (!cwd.trim()) {
      setStatusText("未设置工作目录");
      setStatusErr(true);
      setSyncState(null);
      return;
    }
    setBusy("status");
    const result = await fetchActionProjectSyncStatus(cwd, actionId);
    if (!mountedRef.current) return;
    setBusy(null);
    if (!result.ok) {
      setStatusText(result.error);
      setStatusErr(true);
      setSyncState(null);
      return;
    }
    setSyncState(result.status.state);
    setStatusText(result.status.message);
    setStatusErr(false);
  }, [actionId, cwd]);

  useEffect(() => {
    void runStatusCheck();
  }, [runStatusCheck, actionId]);

  const runOp = useCallback(
    async (
      op: "pull" | "push",
      fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>,
    ) => {
      if (busy || blocked) return;
      if (!cwd.trim()) {
        setStatusText("未设置工作目录");
        setStatusErr(true);
        return;
      }
      setBusy(op);
      setStatusErr(false);
      const result = await fn();
      if (!mountedRef.current) return;
      setBusy(null);
      if (!result.ok) {
        setStatusText(result.error);
        setStatusErr(true);
        return;
      }
      setStatusText(result.message);
      setStatusErr(false);
      onSynced?.();
      await runStatusCheck();
    },
    [actionId, blocked, busy, cwd, onSynced, runStatusCheck],
  );

  const pull = useCallback(
    () =>
      runOp("pull", () =>
        pullActionProjectFromQuicker(cwd, actionId, { projectDirectory }),
      ),
    [actionId, cwd, projectDirectory, runOp],
  );

  const push = useCallback(
    () =>
      runOp("push", () => pushActionProjectToQuickerApi(cwd, actionId)),
    [actionId, cwd, runOp],
  );

  const disabled = busy !== null || blocked;
  const blockHint =
    blocked && blockReason
      ? blockReason
      : blocked
        ? "请先保存标题/描述修改"
        : undefined;

  return (
    <section className="project-info-sync" aria-label="与 Quicker 同步">
      <div className="project-info-sync-actions">
        <button
          type="button"
          className="project-info-sync-btn"
          disabled={busy !== null}
          onClick={() => void runStatusCheck()}
          title="对比 info.json 的 editVersion 与 Quicker 中动作版本"
        >
          {busy === "status" ? "检查中…" : "检查"}
        </button>
        <button
          type="button"
          className="project-info-sync-btn project-info-sync-btn--pull"
          disabled={disabled}
          onClick={() => void pull()}
          title={
            blockHint
              ? blockHint
              : "从 Quicker 拉取（action extract）并覆盖工作区 data.json 等"
          }
        >
          {busy === "pull" ? "拉取中…" : "拉取"}
        </button>
        <button
          type="button"
          className="project-info-sync-btn project-info-sync-btn--push"
          disabled={disabled}
          onClick={() => void push()}
          title={
            blockHint
              ? blockHint
              : "校验工作区项目并提交到 Quicker（validate → apply）"
          }
        >
          {busy === "push" ? "提交中…" : "提交"}
        </button>
      </div>
      {statusText ? (
        <p
          className={`project-info-sync-status${statusErr ? " project-info-sync-status--err" : ""}${stateClassName(syncState)}`}
          role="status"
        >
          {statusText}
        </p>
      ) : null}
    </section>
  );
}
