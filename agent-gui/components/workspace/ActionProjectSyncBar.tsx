"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionProjectSyncState, ActionProjectSyncStatus } from "@/lib/action-project-sync-types";
import {
  resolveActionProjectSyncDecision,
} from "@/lib/action-project-sync-types";
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
import {
  ACTION_PROJECT_PUSHED_EVENT,
  type ActionProjectPushedDetail,
  buildInSyncStatusAfterPush,
} from "@/lib/action-project-sync-events";
import { ActionProjectSyncConflictDialog } from "@/components/workspace/ActionProjectSyncConflictDialog";

type ActionProjectSyncBarProps = {
  cwd: string;
  actionId: string;
  /** Relative `.quicker/actions/...` for extract into an existing title-named folder. */
  projectDirectory?: string;
  /** Block pull/push while info.json title/description edits are unsaved. */
  blocked?: boolean;
  blockReason?: string;
  /** Workspace has unsaved or saved-but-unpushed program edits. */
  hasLocalChanges?: boolean;
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

function syncButtonLabel(busy: boolean): string {
  return busy ? "同步中…" : "同步";
}

function syncButtonTitle(
  syncState: ActionProjectSyncState | null,
  hasLocalChanges: boolean,
  blockHint?: string,
): string {
  if (blockHint) return blockHint;
  if (hasLocalChanges && syncState === "quicker_ahead") {
    return "工作区与 Quicker 均有变更，点击选择保留哪一侧";
  }
  if (hasLocalChanges && syncState === "in_sync") {
    return "将工作区变更提交到 Quicker";
  }
  switch (syncState) {
    case "quicker_ahead":
    case "unknown_local":
      return "从 Quicker 拉取到工作区（action extract）";
    case "disk_ahead":
      return "将工作区变更提交到 Quicker";
    case "in_sync":
      return "已与 Quicker 同步，点击重新检查";
    default:
      return "检查并同步：Quicker 较新则拉取，工作区较新则提交";
  }
}

export function ActionProjectSyncBar({
  cwd,
  actionId,
  projectDirectory,
  blocked = false,
  blockReason,
  hasLocalChanges = false,
  className,
  onSynced,
}: ActionProjectSyncBarProps) {
  const [busy, setBusy] = useState(false);
  const [syncUi, setSyncUi] = useState(() => initialSyncUi(cwd, actionId));
  const [conflictStatus, setConflictStatus] = useState<ActionProjectSyncStatus | null>(null);
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
        return null;
      }

      if (!silent) setBusy(true);

      const result = await fetchActionProjectSyncStatus(cwd, actionId);
      if (!mountedRef.current || statusRequestRef.current !== requestId) return null;

      if (!silent) setBusy(false);
      applyStatusResult(result);
      return result.ok ? result.status.state : null;
    },
    [actionId, applyStatusResult, cwd],
  );

  useEffect(() => {
    void runStatusCheck({ silent: true });
  }, [runStatusCheck, actionId]);

  useEffect(() => {
    const onPushed = (event: Event) => {
      const detail = (event as CustomEvent<ActionProjectPushedDetail>).detail;
      if (!detail) return;
      if (
        detail.cwd.trim() !== cwd.trim()
        || detail.actionId.trim().toLowerCase() !== actionId.trim().toLowerCase()
      ) {
        return;
      }
      if (detail.editVersion != null && detail.editVersion > 0) {
        const status = buildInSyncStatusAfterPush(detail.editVersion);
        applyStatusResult({ ok: true, status });
        return;
      }
      void runStatusCheck({ silent: true });
    };
    window.addEventListener(ACTION_PROJECT_PUSHED_EVENT, onPushed);
    return () => window.removeEventListener(ACTION_PROJECT_PUSHED_EVENT, onPushed);
  }, [actionId, applyStatusResult, cwd, runStatusCheck]);

  const runOp = useCallback(
    async (
      op: "pull" | "push",
      fn: () => Promise<
        | { ok: true; message: string }
        | { ok: false; error: string; versionConflict?: boolean }
      >,
    ) => {
      if (!cwd.trim()) {
        applyStatusResult({ ok: false, error: "未设置工作目录" });
        return false;
      }
      setBusy(true);
      if (op === "pull") {
        beginActionProjectImport(actionId, {
          projectDirectory,
          source: "pull",
        });
      }
      let result:
        | { ok: true; message: string }
        | { ok: false; error: string; versionConflict?: boolean };
      try {
        result = await fn();
      } finally {
        if (op === "pull") {
          endActionProjectImport(actionId);
        }
      }
      if (!mountedRef.current) return false;
      setBusy(false);
      if (!result.ok) {
        if (op === "push" && result.versionConflict) {
          const refreshed = await fetchActionProjectSyncStatus(cwd, actionId);
          if (refreshed.ok) {
            applyStatusResult(refreshed);
            setConflictStatus(refreshed.status);
            return false;
          }
        }
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
        return false;
      }
      setSyncUi((prev) => ({
        ...prev,
        statusText: result.message,
        statusErr: false,
        syncState:
          op === "push"
          && "editVersion" in result
          && typeof result.editVersion === "number"
          && result.editVersion > 0
            ? "in_sync"
            : prev.syncState,
      }));
      onSynced?.();
      await runStatusCheck({ silent: true });
      return true;
    },
    [
      actionId,
      applyStatusResult,
      cwd,
      onSynced,
      projectDirectory,
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
    (options?: { force?: boolean }) =>
      runOp("push", () =>
        pushActionProjectToQuickerApi(cwd, actionId, { force: options?.force }),
      ),
    [actionId, cwd, runOp],
  );

  const executeDecision = useCallback(
    async (
      decision: ReturnType<typeof resolveActionProjectSyncDecision>,
    ): Promise<boolean> => {
      if (decision.kind === "none") return true;
      if (decision.kind === "conflict") {
        setConflictStatus(decision.status);
        return false;
      }
      if (decision.kind === "pull") {
        return pull();
      }
      return push();
    },
    [pull, push],
  );

  const runSmartSync = useCallback(async () => {
    if (busy || blocked) return;
    if (!cwd.trim()) {
      applyStatusResult({ ok: false, error: "未设置工作目录" });
      return;
    }

    setBusy(true);
    const requestId = ++statusRequestRef.current;
    const statusResult = await fetchActionProjectSyncStatus(cwd, actionId);
    if (!mountedRef.current || statusRequestRef.current !== requestId) return;

    if (!statusResult.ok) {
      setBusy(false);
      applyStatusResult(statusResult);
      return;
    }

    applyStatusResult(statusResult);
    const decision = resolveActionProjectSyncDecision(statusResult.status, {
      hasLocalChanges,
    });

    if (decision.kind === "none") {
      setBusy(false);
      return;
    }

    if (decision.kind === "conflict") {
      setBusy(false);
      setConflictStatus(decision.status);
      return;
    }

    setBusy(false);
    await executeDecision(decision);
  }, [
    actionId,
    applyStatusResult,
    blocked,
    busy,
    cwd,
    executeDecision,
    hasLocalChanges,
  ]);

  const handleConflictUseQuicker = useCallback(() => {
    if (busy) return;
    void (async () => {
      const ok = await pull();
      if (ok) setConflictStatus(null);
    })();
  }, [busy, pull]);

  const handleConflictUseWorkspace = useCallback(() => {
    if (busy) return;
    void (async () => {
      const ok = await push({ force: true });
      if (ok) setConflictStatus(null);
    })();
  }, [busy, push]);

  const blockHint =
    blocked && blockReason
      ? blockReason
      : blocked
        ? "请先保存标题/描述修改"
        : undefined;

  const visibleStatusText =
    statusText && (statusErr || syncState !== "in_sync") ? statusText : null;

  const buttonLabel = syncButtonLabel(busy);
  const inSync = !busy && syncState === "in_sync" && !hasLocalChanges;

  return (
    <section
      className={["project-info-sync", className].filter(Boolean).join(" ")}
      aria-label="与 Quicker 同步"
    >
      <div className="project-info-sync-actions">
        <button
          type="button"
          className={`project-info-sync-btn project-info-sync-btn--smart${
            inSync ? " project-info-sync-btn--in-sync" : ""
          }`}
          disabled={busy || blocked}
          onClick={() => void runSmartSync()}
          title={syncButtonTitle(syncState, hasLocalChanges, blockHint)}
        >
          {buttonLabel}
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
      <ActionProjectSyncConflictDialog
        open={conflictStatus != null}
        status={conflictStatus}
        busy={busy}
        onCancel={() => setConflictStatus(null)}
        onUseQuicker={handleConflictUseQuicker}
        onUseWorkspace={handleConflictUseWorkspace}
      />
    </section>
  );
}
