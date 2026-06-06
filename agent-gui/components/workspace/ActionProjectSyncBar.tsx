"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionProjectSyncState } from "@/lib/action-project-sync-types";
import {
  readActionProjectSyncCache,
  writeActionProjectSyncCache,
} from "@/lib/action-project-sync-cache";
import {
  beginActionProjectImport,
  endActionProjectImport,
} from "@/lib/action-project-import-state";
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
  className?: string;
  onSynced?: () => void;
};

function stateClassName(state: ActionProjectSyncState | null): string {
  if (!state) return "";
  return ` project-info-sync-status--${state.replace(/_/g, "-")}`;
}

function initialSyncUi(cwd: string, actionId: string) {
  const cached = readActionProjectSyncCache(cwd, actionId);
  return {
    statusText: cached?.message ?? null,
    statusErr: cached?.error ?? false,
    syncState: cached?.state ?? null,
  };
}

export function ActionProjectSyncBar({
  cwd,
  actionId,
  projectDirectory,
  blocked = false,
  blockReason,
  className,
  onSynced,
}: ActionProjectSyncBarProps) {
  const [busy, setBusy] = useState<"status" | "pull" | "push" | null>(null);
  const [syncUi, setSyncUi] = useState(() => initialSyncUi(cwd, actionId));
  const { statusText, statusErr, syncState } = syncUi;
  const mountedRef = useRef(true);
  const statusRequestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyStatusResult = useCallback(
    (
      result:
        | { ok: true; status: { state: ActionProjectSyncState; message: string } }
        | { ok: false; error: string },
    ) => {
      if (!result.ok) {
        setSyncUi({
          statusText: result.error,
          statusErr: true,
          syncState: null,
        });
        writeActionProjectSyncCache(cwd, actionId, {
          state: null,
          message: result.error,
          error: true,
        });
        return;
      }
      setSyncUi({
        statusText: result.status.message,
        statusErr: false,
        syncState: result.status.state,
      });
      writeActionProjectSyncCache(cwd, actionId, {
        state: result.status.state,
        message: result.status.message,
        error: false,
      });
    },
    [actionId, cwd],
  );

  const runStatusCheck = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      const requestId = ++statusRequestRef.current;

      if (!cwd.trim()) {
        applyStatusResult({ ok: false, error: "未设置工作目录" });
        return;
      }

      if (!silent) setBusy("status");

      const result = await fetchActionProjectSyncStatus(cwd, actionId);
      if (!mountedRef.current || statusRequestRef.current !== requestId) return;

      if (!silent) setBusy(null);
      applyStatusResult(result);
    },
    [actionId, applyStatusResult, cwd],
  );

  useEffect(() => {
    void runStatusCheck({ silent: true });
  }, [runStatusCheck, actionId]);

  const runOp = useCallback(
    async (
      op: "pull" | "push",
      fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>,
    ) => {
      if (busy || blocked) return;
      if (!cwd.trim()) {
        applyStatusResult({ ok: false, error: "未设置工作目录" });
        return;
      }
      setBusy(op);
      if (op === "pull") {
        beginActionProjectImport(actionId, {
          projectDirectory,
          source: "pull",
        });
      }
      let result: { ok: true; message: string } | { ok: false; error: string };
      try {
        result = await fn();
      } finally {
        if (op === "pull") {
          endActionProjectImport(actionId);
        }
      }
      if (!mountedRef.current) return;
      setBusy(null);
      if (!result.ok) {
        setSyncUi((prev) => ({
          ...prev,
          statusText: result.error,
          statusErr: true,
        }));
        writeActionProjectSyncCache(cwd, actionId, {
          state: syncState,
          message: result.error,
          error: true,
        });
        return;
      }
      setSyncUi((prev) => ({
        ...prev,
        statusText: result.message,
        statusErr: false,
      }));
      onSynced?.();
      await runStatusCheck({ silent: true });
    },
    [
      actionId,
      applyStatusResult,
      blocked,
      busy,
      cwd,
      onSynced,
      runStatusCheck,
      syncState,
    ],
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

  const visibleStatusText =
    statusText && (statusErr || syncState !== "in_sync") ? statusText : null;

  return (
    <section
      className={["project-info-sync", className].filter(Boolean).join(" ")}
      aria-label="与 Quicker 同步"
    >
      <div className="project-info-sync-actions">
        <button
          type="button"
          className="project-info-sync-btn"
          disabled={busy !== null}
          onClick={() => void runStatusCheck({ silent: false })}
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
              : "将工作区 patch 提交到 Quicker（语法问题用 workspace_program diagnostics 检查）"
          }
        >
          {busy === "push" ? "提交中…" : "提交"}
        </button>
      </div>
      {visibleStatusText ? (
        <p
          className={`project-info-sync-status${
            statusErr ? " project-info-sync-status--err" : ""
          }${stateClassName(syncState)}`}
          role="status"
        >
          {visibleStatusText}
        </p>
      ) : null}
    </section>
  );
}
