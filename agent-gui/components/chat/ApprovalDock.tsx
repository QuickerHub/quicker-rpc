"use client";

import {
  buildApprovalDockCopy,
  type PendingToolApproval,
} from "@/lib/tool-approval-display";
import type { WorkspaceDeleteProjectHit } from "@/lib/workspace-action-project-lookup";

type ApprovalDockProps = {
  approvals: PendingToolApproval[];
  disabled: boolean;
  workspaceHits: WorkspaceDeleteProjectHit[];
  deleteWorkspaceToo: boolean;
  onDeleteWorkspaceTooChange: (value: boolean) => void;
  onApproveAll: (options: { deleteWorkspace: boolean }) => void;
  onDenyAll: () => void;
};

export function ApprovalDock({
  approvals,
  disabled,
  workspaceHits,
  deleteWorkspaceToo,
  onDeleteWorkspaceTooChange,
  onApproveAll,
  onDenyAll,
}: ApprovalDockProps) {
  const actionWorkspaceHits = workspaceHits.filter((h) => h.kind === "action");
  const subprogramWorkspaceHits = workspaceHits.filter(
    (h) => h.kind === "subprogram",
  );
  const copy = buildApprovalDockCopy(approvals, {
    workspaceActionProjectCount: actionWorkspaceHits.length,
    workspaceSubProgramProjectCount: subprogramWorkspaceHits.length,
  });

  return (
    <div
      className={`approval-hint${copy.destructive ? " approval-hint--destructive" : ""}`}
      role="group"
      aria-label={copy.title}
    >
      <div className="approval-hint-main">
        <div className="approval-hint-title">{copy.title}</div>
        <div className="approval-hint-summary">{copy.summary}</div>
        {copy.shellCommands && copy.shellCommands.length > 0 ? (
          <div className="approval-hint-shell-commands" aria-label="待执行的终端命令">
            {copy.shellCommands.map((command, index) => (
              <pre
                key={`${index}-${command.slice(0, 24)}`}
                className="approval-hint-shell-command"
              >
                {command}
              </pre>
            ))}
          </div>
        ) : null}
        {copy.workspaceDelete ? (
          <label className="approval-hint-workspace">
            <input
              type="checkbox"
              checked={deleteWorkspaceToo}
              disabled={disabled}
              onChange={(event) => onDeleteWorkspaceTooChange(event.target.checked)}
            />
            <span className="approval-hint-workspace-text">
              {copy.workspaceDelete.checkboxLabel}
            </span>
            {copy.workspaceDelete.detail ? (
              <span className="approval-hint-workspace-detail">
                {copy.workspaceDelete.detail}
              </span>
            ) : null}
          </label>
        ) : null}
      </div>
      <div className="approval-hint-actions">
        <button
          type="button"
          className={`approval-hint-btn approval-hint-btn--approve${copy.destructive ? " approval-hint-btn--danger" : ""}`}
          disabled={disabled}
          onClick={() =>
            onApproveAll({
              deleteWorkspace: deleteWorkspaceToo && workspaceHits.length > 0,
            })}
        >
          {copy.approveLabel}
        </button>
        <button
          type="button"
          className="approval-hint-btn approval-hint-btn--deny"
          disabled={disabled}
          onClick={onDenyAll}
        >
          {copy.denyLabel}
        </button>
      </div>
    </div>
  );
}
