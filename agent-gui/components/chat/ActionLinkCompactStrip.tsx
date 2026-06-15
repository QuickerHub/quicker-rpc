"use client";

import { useCallback, useState } from "react";
import { ActionIcon } from "@/components/chat/ActionIcon";
import { FaIconProvider } from "@/components/chat/FaIconProvider";
import { ActionLinkCardDelete } from "@/components/chat/ActionLinkCardDelete";
import { ActionLinkCardPromptMenu } from "@/components/chat/ActionLinkCardPromptMenu";
import {
  ACTION_LINK_COMPACT_PROMPTS,
  buildActionLinkCardPromptMessage,
} from "@/lib/action-link-card-prompts";
import { executeActionLinkOp } from "@/lib/action-link-execute";
import { useIsActionFocusedInSidePanel } from "@/lib/action-side-panel-focus";
import {
  useOptionalWorkspaceExplorerEditor,
  useWorkspaceExplorerShell,
} from "@/lib/workspace-explorer";

type ActionLinkCompactStripProps = {
  actionId: string;
  title: string;
  displayTitle: string;
  description?: string;
  iconSpec?: string;
  workingDirectory?: string;
  onDismissed?: () => void;
  onInsertComposerPrompt?: (text: string) => void;
};

export function ActionLinkCompactStrip({
  actionId,
  title,
  displayTitle,
  description,
  iconSpec,
  workingDirectory,
  onDismissed,
  onInsertComposerPrompt,
}: ActionLinkCompactStripProps) {
  const { focusSidePanelView } = useWorkspaceExplorerShell();
  const editor = useOptionalWorkspaceExplorerEditor();
  const focusedInSidePanel = useIsActionFocusedInSidePanel(actionId);
  const [runParam, setRunParam] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const cardBusy = busy || deleteBusy;

  const openOrFocusWorkspace = useCallback(async () => {
    if (cardBusy) return;
    if (focusedInSidePanel) {
      const tabId = editor?.activeTabId;
      if (tabId) focusSidePanelView(tabId);
      return;
    }
    setBusy(true);
    try {
      await executeActionLinkOp(actionId, "workspace", {
        cwd: workingDirectory?.trim() || undefined,
      });
    } finally {
      setBusy(false);
    }
  }, [
    actionId,
    cardBusy,
    editor?.activeTabId,
    focusSidePanelView,
    focusedInSidePanel,
    workingDirectory,
  ]);

  const invokeRunOp = useCallback(
    async (op: "run" | "debug") => {
      if (cardBusy) return;
      setBusy(true);
      try {
        await executeActionLinkOp(actionId, op, {
          cwd: workingDirectory?.trim() || undefined,
          param: runParam.trim() || undefined,
        });
      } finally {
        setBusy(false);
      }
    },
    [actionId, cardBusy, runParam, workingDirectory],
  );

  const insertPrompt = useCallback(
    (promptId: string) => {
      if (!onInsertComposerPrompt || cardBusy) return;
      const message = buildActionLinkCardPromptMessage(promptId, {
        actionId,
        title: displayTitle,
        param: runParam.trim() || undefined,
      });
      if (message) onInsertComposerPrompt(message);
    },
    [actionId, cardBusy, displayTitle, onInsertComposerPrompt, runParam],
  );

  const focusTitle = [
    title,
    description?.trim(),
    focusedInSidePanel ? "已在右侧打开" : "点击在右侧打开编辑器",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className="action-link-compact"
      role="region"
      aria-label={`动作：${title}`}
    >
      <div className="action-link-compact__head">
        <button
          type="button"
          className="action-link-compact__focus"
          disabled={cardBusy}
          onClick={() => void openOrFocusWorkspace()}
          title={focusTitle}
        >
          <FaIconProvider specs={iconSpec ? [iconSpec] : []}>
            <span className="action-link-compact__icon-wrap" aria-hidden>
              <ActionIcon
                spec={iconSpec}
                className="action-link-compact__icon"
                title=""
              />
            </span>
          </FaIconProvider>
          <span className="action-link-compact__title">{title}</span>
        </button>

        <div className="action-link-compact__head-tools">
          {onInsertComposerPrompt ? (
            <ActionLinkCardPromptMenu
              disabled={cardBusy}
              prompts={ACTION_LINK_COMPACT_PROMPTS}
              menuLabel="更多操作"
              wrapperClassName="action-link-compact__menu"
              triggerClassName="action-link-compact__tool"
              onSelectPrompt={insertPrompt}
            />
          ) : null}
          <ActionLinkCardDelete
            actionId={actionId}
            cwd={workingDirectory ?? ""}
            displayTitle={displayTitle}
            disabled={cardBusy}
            layout="icon"
            onBusyChange={setDeleteBusy}
            onDismissed={onDismissed}
          />
        </div>
      </div>

      <div className="action-link-compact__ops" role="group" aria-label="运行与调试">
        <button
          type="button"
          className="action-link-compact__op action-link-compact__op--primary"
          disabled={cardBusy}
          title={`运行 · ${actionId}`}
          onClick={() => void invokeRunOp("run")}
        >
          运行
        </button>
        <button
          type="button"
          className="action-link-compact__op"
          disabled={cardBusy}
          title="调试：侧栏查看步骤输出"
          onClick={() => void invokeRunOp("debug")}
        >
          调试
        </button>
        <div className="action-link-compact__param-wrap">
          <input
            type="text"
            className="action-link-compact__param"
            value={runParam}
            disabled={cardBusy}
            placeholder="参数"
            title="传给 Quicker 的运行/调试参数（--param）"
            aria-label="运行参数"
            onChange={(event) => setRunParam(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !cardBusy) {
                event.preventDefault();
                void invokeRunOp("run");
              }
            }}
          />
        </div>
      </div>
    </article>
  );
}
