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
  readActionProjectImportEntry,
} from "@/lib/action-project-import-state";
import {
  fetchActionProjectSyncStatus,
  pullActionProjectFromQuicker,
  pushActionProjectToQuickerApi,
} from "@/lib/action-project-sync-client";
import {
  buildInSyncStatusAfterPush,
  type ActionProjectPushedDetail,
  ACTION_PROJECT_PUSHED_EVENT,
} from "@/lib/action-project-sync-events";
import { ActionProjectSyncConflictDialog } from "@/components/workspace/ActionProjectSyncConflictDialog";
import { normalizeActionProjectEditVersion, type ActionProjectEditVersion } from "@/lib/action-project-edit-version";
import { actionProjectSyncTargetKey, type ActionProjectSyncTarget } from "@/lib/action-project-sync-target";

type ActionProjectSyncBarProps = {
  cwd: string;
  actionId: string;
  /** Relative `.quicker/actions/...` for extract into an existing title-named folder. */
  projectDirectory?: string;
  target?: ActionProjectSyncTarget;
  targetRequired?: boolean;
  /** Block pull/push while info.json title/description edits are unsaved. */
  blocked?: boolean;
  blockReason?: string;
  /** Workspace has unsaved or saved-but-unpushed program edits. */
  hasLocalChanges?: boolean;
  className?: string;
  onSynced?: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
};

function stateClassName(state: ActionProjectSyncState | null): string {
  if (!state) return "";
  return ` project-info-sync-status--${state.replace(/_/g, "-")}`;
}

function initialSyncUi(cwd: string, actionId: string, target?: ActionProjectSyncTarget) {
  const cached = readActionProjectSyncCache(cwd, actionId, target);
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
  target,
  targetRequired = false,
  blocked = false,
  blockReason,
  hasLocalChanges = false,
  className,
  onSynced,
  onBusyChange,
}: ActionProjectSyncBarProps) {
  const targetKey = actionProjectSyncTargetKey(target);
  const ownerKey = JSON.stringify([cwd, actionId, projectDirectory, targetKey]);
  const ownerRef = useRef({ key: ownerKey });
  if (ownerRef.current.key !== ownerKey) ownerRef.current = { key: ownerKey };
  const owner = ownerRef.current;
  const mountedRef = useRef(true);
  const isCurrent = useCallback(() => mountedRef.current && ownerRef.current === owner, [owner]);
  const targetReady = !targetRequired || Boolean(target);
  const [busyState, setBusyState] = useState({ owner, value: false });
  const busy = busyState.owner === owner && busyState.value;
  const setBusy = useCallback((value: boolean) => { if (isCurrent()) setBusyState({ owner, value }); }, [isCurrent, owner]);
  const [syncUiState, setSyncUiState] = useState(() => ({ owner, value: initialSyncUi(cwd, actionId, target) }));
  const syncUi = syncUiState.owner === owner ? syncUiState.value : initialSyncUi(cwd, actionId, target);
  const setSyncUi = useCallback((update: typeof syncUi | ((previous: typeof syncUi) => typeof syncUi)) => {
    if (isCurrent()) setSyncUiState((previous) => ({ owner, value: typeof update === "function" ? update(previous.owner === owner ? previous.value : initialSyncUi(cwd, actionId, target)) : update }));
  }, [isCurrent, owner, cwd, actionId, targetKey]);
  const [conflictOwner, setConflictOwner] = useState<{ owner: typeof owner; status: ActionProjectSyncStatus | null }>({ owner, status: null });
  const conflictStatus = conflictOwner.owner === owner ? conflictOwner.status : null;
  const setConflictStatus = useCallback((status: ActionProjectSyncStatus | null) => { if (isCurrent()) setConflictOwner({ owner, status }); }, [isCurrent, owner]);
  const { statusText, statusErr, syncState } = syncUi;
  const statusRequestRef = useRef(0);

  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange, owner]);

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
      if (!isCurrent()) return;
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
        }, target);
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
      }, target);
    },
    [actionId, cwd, targetKey, isCurrent, setSyncUi],
  );

  const runStatusCheck = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      const requestId = ++statusRequestRef.current;
      if (!targetReady || !isCurrent()) return null;

      if (!cwd.trim()) {
        applyStatusResult({ ok: false, error: "未设置工作目录" });
        return null;
      }

      if (!silent) setBusy(true);

      const result = await fetchActionProjectSyncStatus(cwd, actionId, { target, isCurrent });
      if (!isCurrent() || statusRequestRef.current !== requestId) return null;

      if (!silent) setBusy(false);
      applyStatusResult(result);
      return result.ok ? result.status.state : null;
    },
    [actionId, applyStatusResult, cwd, targetKey, targetReady, isCurrent, setBusy],
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
        || actionProjectSyncTargetKey(detail.target) !== targetKey
      ) {
        return;
      }
      const version = normalizeActionProjectEditVersion(detail.editVersion);
      if (version != null) {
        const status = buildInSyncStatusAfterPush(version);
        applyStatusResult({ ok: true, status });
        return;
      }
      void runStatusCheck({ silent: true });
    };
    window.addEventListener(ACTION_PROJECT_PUSHED_EVENT, onPushed);
    return () => window.removeEventListener(ACTION_PROJECT_PUSHED_EVENT, onPushed);
  }, [actionId, applyStatusResult, cwd, runStatusCheck, targetKey]);

  const runOp = useCallback(
    async (
      op: "pull" | "push",
      fn: () => Promise<
        | { ok: true; message: string; editVersion?: ActionProjectEditVersion; summary?: { editVersion?: ActionProjectEditVersion } }
        | { ok: false; error: string; versionConflict?: boolean }
      >,
    ) => {
      if (!targetReady || !isCurrent()) return false;
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
      const importEntry = op === "pull" ? readActionProjectImportEntry(actionId) : undefined;
      let result:
        | { ok: true; message: string; editVersion?: ActionProjectEditVersion; summary?: { editVersion?: ActionProjectEditVersion } }
        | { ok: false; error: string; versionConflict?: boolean };
      try {
        result = await fn();
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : String(error) };
      } finally {
        if (op === "pull" && readActionProjectImportEntry(actionId) === importEntry) {
          endActionProjectImport(actionId);
        }
      }
      if (!isCurrent()) return false;
      try {
        if (!result.ok) {
          if (op === "push" && result.versionConflict) {
            const refreshed = await fetchActionProjectSyncStatus(cwd, actionId, { target, isCurrent });
            if (!isCurrent()) return false;
            if (refreshed.ok) {
              applyStatusResult(refreshed);
              setConflictStatus(refreshed.status);
              return false;
            }
          }
          setSyncUi({
            statusText: result.error,
            statusErr: true,
            syncState: null,
          });
          writeActionProjectSyncCache(cwd, actionId, {
            state: null,
            message: result.error,
            error: true,
          }, target);
          return false;
        }

        const syncedEditVersion = normalizeActionProjectEditVersion(result.editVersion)
          ?? normalizeActionProjectEditVersion(result.summary?.editVersion);

        if (syncedEditVersion != null) {
          applyStatusResult({
            ok: true,
            status: buildInSyncStatusAfterPush(syncedEditVersion),
          });
        } else {
          setSyncUi((prev) => ({
            ...prev,
            statusText: result.message,
            statusErr: false,
          }));
        }

        try {
          await onSynced?.();
        } catch (error) {
          if (!isCurrent()) return false;
          const detail = error instanceof Error ? error.message : String(error);
          const message = detail.startsWith("宿主已同步") ? detail : `宿主已同步，但工作区刷新失败：${detail}`;
          setConflictStatus(null);
          applyStatusResult({ ok: false, error: message });
          return false;
        }
        if (!isCurrent()) return false;
        if (syncedEditVersion == null) {
          await runStatusCheck({ silent: true });
        }
        return true;
      } finally {
        if (isCurrent()) setBusy(false);
      }
    },
    [
      actionId,
      applyStatusResult,
      cwd,
      onSynced,
      projectDirectory,
      runStatusCheck,
      targetKey, targetReady, isCurrent, setBusy, setSyncUi, setConflictStatus,
    ],
  );

  const pull = useCallback(
    () =>
      runOp("pull", () =>
        pullActionProjectFromQuicker(cwd, actionId, { projectDirectory, target, isCurrent }),
      ),
    [actionId, cwd, projectDirectory, runOp, targetKey, isCurrent],
  );

  const push = useCallback(
    (options?: { force?: boolean }) =>
      runOp("push", () =>
        pushActionProjectToQuickerApi(cwd, actionId, { force: options?.force, target, isCurrent }),
      ),
    [actionId, cwd, runOp, targetKey, isCurrent],
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
    if (busy || blocked || !targetReady || !isCurrent()) return;
    if (!cwd.trim()) {
      applyStatusResult({ ok: false, error: "未设置工作目录" });
      return;
    }

    setBusy(true);
    const requestId = ++statusRequestRef.current;
    const statusResult = await fetchActionProjectSyncStatus(cwd, actionId, { target, isCurrent });
    if (!isCurrent() || statusRequestRef.current !== requestId) return;

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
    targetKey, targetReady, isCurrent, setBusy, setConflictStatus,
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
          disabled={busy || blocked || !targetReady}
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
