"use client";

import { useCallback, useState } from "react";
import { ActionIcon } from "@/components/chat/ActionIcon";
import { FaIconProvider } from "@/components/chat/FaIconProvider";
import type { ParsedActionLink } from "@/lib/action-link-markup";
import { buildActionLinkCardPromptMessage } from "@/lib/action-link-card-prompts";
import { ActionLinkCardDelete } from "@/components/chat/ActionLinkCardDelete";
import { ActionLinkCardPromptMenu } from "@/components/chat/ActionLinkCardPromptMenu";
import { executeActionLinkOp } from "@/lib/action-link-execute";
import { formatActionIdShort } from "@/lib/action-patch-followup";
import { useActionMetadata } from "@/lib/use-action-metadata";
import { useChatStore } from "@/lib/use-chat-store";

type ActionLinkCardProps = {
  actionId: string;
  links: ParsedActionLink[];
  workingDirectory?: string;
  onDismissed?: () => void;
  onInsertComposerPrompt?: (text: string) => void;
};

export function ActionLinkCard({
  actionId,
  links,
  workingDirectory: cwdProp,
  onDismissed,
  onInsertComposerPrompt,
}: ActionLinkCardProps) {
  const { store, defaultCwd } = useChatStore();
  const cwd = (cwdProp ?? (store.workingDirectory.trim() || defaultCwd)).trim();
  const metaState = useActionMetadata(actionId, cwd);
  const [busyOp, setBusyOp] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [runParam, setRunParam] = useState("");
  const cardBusy = busyOp !== null || deleteBusy;

  const title =
    metaState.status === "ok"
      ? metaState.meta.title
      : metaState.status === "loading"
        ? "加载中…"
        : formatActionIdShort(actionId);
  const description =
    metaState.status === "ok" ? metaState.meta.description : undefined;
  const iconSpec =
    metaState.status === "ok" ? metaState.meta.icon : undefined;

  const runLink = links.find((link) => link.op === "run");
  const debugLink = links.find((link) => link.op === "debug");
  const showDebugButton = !debugLink;
  const showRun = Boolean(runLink);
  const showDebug = Boolean(debugLink) || showDebugButton;
  const otherLinks = links.filter(
    (link) => link.op !== "run" && link.op !== "debug",
  );

  const invokeOp = useCallback(
    async (op: ParsedActionLink["op"]) => {
      if (cardBusy) return;
      setBusyOp(op);
      try {
        const param = runParam.trim() || undefined;
        await executeActionLinkOp(actionId, op, {
          cwd: cwd || undefined,
          param,
        });
      } finally {
        setBusyOp(null);
      }
    },
    [actionId, cardBusy, cwd, runParam],
  );

  const displayTitle =
    metaState.status === "ok" ? metaState.meta.title : formatActionIdShort(actionId);

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

  const showPrompts = Boolean(onInsertComposerPrompt);
  const showDebugPrompt = showPrompts && showDebug;

  return (
    <article
      className="action-link-card"
      role="region"
      aria-label={`动作：${title}`}
    >
      <div className="action-link-card-body">
        <header className="action-link-card-head">
          <FaIconProvider specs={iconSpec ? [iconSpec] : []}>
            <div className="action-link-card-icon-wrap">
              <ActionIcon
                spec={iconSpec}
                className="action-link-card-icon"
                title={title}
              />
            </div>
          </FaIconProvider>
          <div className="action-link-card-heading">
            <h3 className="action-link-card-title" title={title}>
              {title}
            </h3>
            {description ? (
              <p className="action-link-card-desc" title={description}>
                {description}
              </p>
            ) : (
              <code className="action-link-card-id" title={actionId}>
                {formatActionIdShort(actionId)}
              </code>
            )}
          </div>
          {showPrompts ? (
            <ActionLinkCardPromptMenu
              disabled={cardBusy}
              onSelectPrompt={insertPrompt}
            />
          ) : null}
        </header>

        <div className="action-link-card-main">
          <div
            className={`action-link-card-toolbar${
              showRun || showDebugPrompt ? " action-link-card-toolbar--with-run" : ""
            }`}
            role="group"
            aria-label="快捷操作"
          >
        {showRun || showDebugPrompt ? (
          <>
            <div
              className={`action-link-card-action-grid${
                showRun && showDebugPrompt ? "" : " action-link-card-action-grid--single"
              }`}
              role="group"
              aria-label="运行"
            >
              {showRun ? (
                <button
                  type="button"
                  className="action-link-card-btn action-link-card-btn--stretch action-link-card-btn--primary action-link-card-btn--run"
                  disabled={cardBusy}
                  title={`${runLink?.label ?? "运行"} · ${actionId}`}
                  onClick={() => void invokeOp("run")}
                >
                  {runLink?.label ?? "运行"}
                </button>
              ) : null}
              {showDebugPrompt ? (
                <button
                  type="button"
                  className="action-link-card-btn action-link-card-btn--stretch action-link-card-btn--ghost"
                  disabled={cardBusy}
                  title="插入调试指令到输入框（发送后由 Agent 执行）"
                  onClick={() => insertPrompt("debug")}
                >
                  {debugLink?.label ?? "调试"}
                </button>
              ) : null}
            </div>
            <div className="action-link-card-param-wrap action-link-card-param-wrap--stretch">
              <input
                type="text"
                className="action-link-card-param-input"
                value={runParam}
                disabled={cardBusy}
                placeholder="参数"
                title="传给 Quicker 的运行/调试参数（--param）"
                aria-label="运行参数"
                onChange={(event) => setRunParam(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && showRun && !cardBusy) {
                    event.preventDefault();
                    void invokeOp("run");
                  }
                }}
              />
            </div>
          </>
        ) : null}

        {otherLinks.length > 0 ? (
          <div
            className="action-link-card-action-grid action-link-card-action-grid--ops"
            role="group"
            aria-label="编辑与工具"
          >
            {otherLinks.map((link, index) => (
              <button
                key={`${link.op}-${index}`}
                type="button"
                className={`action-link-card-btn action-link-card-btn--stretch action-link-card-btn--ghost action-link-card-btn--${link.op}`}
                disabled={cardBusy}
                title={`${link.label} · ${link.actionId}`}
                onClick={() => void invokeOp(link.op)}
              >
                {link.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="action-link-card-delete-row">
          <ActionLinkCardDelete
            actionId={actionId}
            cwd={cwd}
            displayTitle={displayTitle}
            disabled={cardBusy}
            onBusyChange={setDeleteBusy}
            onDismissed={onDismissed}
          />
        </div>
          </div>
        </div>
      </div>
    </article>
  );
}
