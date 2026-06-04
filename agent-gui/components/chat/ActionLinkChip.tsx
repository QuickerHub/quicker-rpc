"use client";

import { useCallback, useState } from "react";
import type { ParsedActionLink } from "@/lib/action-link-markup";
import { executeActionLinkOp } from "@/lib/action-link-execute";
import { useChatStore } from "@/lib/use-chat-store";

type ActionLinkChipProps = {
  link: ParsedActionLink;
  workingDirectory?: string;
};

export function ActionLinkChip({
  link,
  workingDirectory: cwdProp,
}: ActionLinkChipProps) {
  const store = useChatStore();
  const cwd = (cwdProp ?? store.workingDirectory).trim();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await executeActionLinkOp(link.actionId, link.op, { cwd: cwd || undefined });
    } finally {
      setBusy(false);
    }
  }, [busy, cwd, link.actionId, link.op]);

  return (
    <button
      type="button"
      className={`action-link-chip action-link-chip--${link.op}`}
      disabled={busy}
      title={`${link.label} · ${link.actionId}`}
      onClick={() => void onClick()}
    >
      {link.label}
    </button>
  );
}
