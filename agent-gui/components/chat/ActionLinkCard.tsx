"use client";

import { useCallback, useState } from "react";
import { ActionIcon } from "@/components/chat/ActionIcon";
import { FaIconProvider } from "@/components/chat/FaIconProvider";
import type { ParsedActionLink } from "@/lib/action-link-markup";
import { ActionLinkCardDelete } from "@/components/chat/ActionLinkCardDelete";
import { executeActionLinkOp } from "@/lib/action-link-execute";
import { formatActionIdShort } from "@/lib/action-patch-followup";
import { useActionMetadata } from "@/lib/use-action-metadata";
import { useChatStore } from "@/lib/use-chat-store";

type ActionLinkCardProps = {
  actionId: string;
  links: ParsedActionLink[];
  workingDirectory?: string;
  onDismissed?: () => void;
};

export function ActionLinkCard({
  actionId,
  links,
  workingDirectory: cwdProp,
  onDismissed,
}: ActionLinkCardProps) {
  const { store, defaultCwd } = useChatStore();
  const cwd = (cwdProp ?? (store.workingDirectory.trim() || defaultCwd)).trim();
  const metaState = useActionMetadata(actionId);
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

  return (
    <article
      className="action-link-card"
      role="region"
      aria-label={`动作：${title}`}
    >
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
      </header>

      <div className="action-link-card-toolbar" role="group" aria-label="快捷操作">
        {showRun || showDebug ? (
          <div className="action-link-card-run-cluster">
            <div className="action-link-card-segmented" role="group" aria-label="运行">
              {showRun ? (
                <button
                  type="button"
                  className="action-link-card-btn action-link-card-btn--segment action-link-card-btn--segment-primary"
                  disabled={cardBusy}
                  title={`${runLink?.label ?? "运行"} · ${actionId}`}
                  onClick={() => void invokeOp("run")}
                >
                  {runLink?.label ?? "运行"}
                </button>
              ) : null}
              {showDebug ? (
                <button
                  type="button"
                  className="action-link-card-btn action-link-card-btn--segment"
                  disabled={cardBusy}
                  title="带参数调试运行并打开 Quicker 步骤调试器"
                  onClick={() => void invokeOp("debug")}
                >
                  {debugLink?.label ?? "调试"}
                </button>
              ) : null}
            </div>
            <div className="action-link-card-param-wrap">
              <span className="action-link-card-param-prefix" aria-hidden>
                参数
              </span>
              <input
                type="text"
                className="action-link-card-param-input"
                value={runParam}
                disabled={cardBusy}
                placeholder="可选"
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
          </div>
        ) : null}
        <div
          className={`action-link-card-ops-row${
            showRun || showDebug ? " action-link-card-ops-row--split" : ""
          }`}
        >
          <div className="action-link-card-ops-main">
            {otherLinks.map((link, index) => (
              <button
                key={`${link.op}-${index}`}
                type="button"
                className={`action-link-card-btn action-link-card-btn--ghost action-link-card-btn--${link.op}`}
                disabled={cardBusy}
                title={`${link.label} · ${link.actionId}`}
                onClick={() => void invokeOp(link.op)}
              >
                {link.label}
              </button>
            ))}
          </div>
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
    </article>
  );
}
