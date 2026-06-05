"use client";

import { useCallback, useState } from "react";
import type { ParsedActionLink } from "@/lib/action-link-markup";
import { ActionLinkCard } from "@/components/chat/ActionLinkCard";

type ActionLinkBarProps = {
  links: ParsedActionLink[];
  workingDirectory?: string;
};

function groupLinksByActionId(
  links: ParsedActionLink[],
): { actionId: string; links: ParsedActionLink[] }[] {
  const order: string[] = [];
  const map = new Map<string, ParsedActionLink[]>();

  for (const link of links) {
    const id = link.actionId.trim().toLowerCase();
    if (!map.has(id)) {
      order.push(id);
      map.set(id, []);
    }
    const bucket = map.get(id)!;
    if (!bucket.some((row) => row.op === link.op)) {
      bucket.push({ ...link, actionId: id });
    }
  }

  return order.map((actionId) => ({
    actionId,
    links: map.get(actionId)!,
  }));
}

export function ActionLinkBar({ links, workingDirectory }: ActionLinkBarProps) {
  const [dismissedIds, setDismissedIds] = useState(() => new Set<string>());

  const dismissCard = useCallback((actionId: string) => {
    setDismissedIds((prev) => {
      if (prev.has(actionId)) return prev;
      const next = new Set(prev);
      next.add(actionId);
      return next;
    });
  }, []);

  if (links.length === 0) return null;

  const groups = groupLinksByActionId(links).filter(
    (group) => !dismissedIds.has(group.actionId),
  );

  if (groups.length === 0) return null;

  return (
    <div className="action-link-bar">
      {groups.map((group) => (
        <ActionLinkCard
          key={group.actionId}
          actionId={group.actionId}
          links={group.links}
          workingDirectory={workingDirectory}
          onDismissed={() => dismissCard(group.actionId)}
        />
      ))}
    </div>
  );
}
