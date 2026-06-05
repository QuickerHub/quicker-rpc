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

  const onOp = useCallback(
    async (link: ParsedActionLink) => {
      if (cardBusy) return;
      setBusyOp(link.op);
      try {
        await executeActionLinkOp(link.actionId, link.op, {
          cwd: cwd || undefined,
        });
      } finally {
        setBusyOp(null);
      }
    },
    [cardBusy, cwd],
  );

  const onDebug = useCallback(async () => {
    if (cardBusy) return;
    setBusyOp("debug");
    try {
      await executeActionLinkOp(actionId, "debug", { cwd: cwd || undefined });
    } finally {
      setBusyOp(null);
    }
  }, [actionId, cardBusy, cwd]);

  const showDebugButton = !links.some((link) => link.op === "debug");

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

      <div className="action-link-card-actions" role="group" aria-label="快捷操作">
        <div className="action-link-card-actions-main">
          {links.map((link, index) => (
            <button
              key={`${link.op}-${index}`}
              type="button"
              className={`action-link-card-btn action-link-card-btn--${link.op}${
                link.op === "run" ? " action-link-card-btn--primary" : ""
              }`}
              disabled={cardBusy}
              title={`${link.label} · ${link.actionId}`}
              onClick={() => void onOp(link)}
            >
              {link.label}
            </button>
          ))}
          {showDebugButton ? (
            <button
              type="button"
              className="action-link-card-btn action-link-card-btn--debug"
              disabled={cardBusy}
              title="带参数调试运行并打开 Quicker 步骤调试器"
              onClick={() => void onDebug()}
            >
              调试
            </button>
          ) : null}
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
    </article>
  );
}
