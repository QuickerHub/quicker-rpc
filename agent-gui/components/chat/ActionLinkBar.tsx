"use client";

import type { ParsedActionLink } from "@/lib/action-link-markup";
import { ActionLinkChip } from "@/components/chat/ActionLinkChip";

type ActionLinkBarProps = {
  links: ParsedActionLink[];
  workingDirectory?: string;
};

export function ActionLinkBar({ links, workingDirectory }: ActionLinkBarProps) {
  if (links.length === 0) return null;

  return (
    <div className="action-link-bar" role="group" aria-label="动作快捷操作">
      {links.map((link, index) => (
        <span key={`${link.actionId}-${link.op}-${index}`} className="action-link-bar__item">
          {index > 0 ? (
            <span className="action-link-bar__sep" aria-hidden>
              ·
            </span>
          ) : null}
          <ActionLinkChip link={link} workingDirectory={workingDirectory} />
        </span>
      ))}
    </div>
  );
}
