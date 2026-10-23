"use client";

import type { JSX } from "react";
import { ActionIcon } from "@/components/chat/ActionIcon";
import { FaIconProvider } from "@/components/chat/FaIconProvider";
import { resolveActionProjectIconSpec } from "@/lib/action-project-icon";
import { useDesignerCatalogContext } from "@/lib/action-editor/catalog/DesignerCatalogProvider";
import { IconControl } from "@/lib/action-editor/shared/IconControl";

export type ActionProjectMetaSummaryProps = {
  icon?: string;
  title: string;
  description?: string;
  className?: string;
};

/** Read-only action/subprogram icon + title + description (from info.json). */
export function ActionProjectMetaSummary({
  icon,
  title,
  description,
  className,
}: ActionProjectMetaSummaryProps): JSX.Element {
  const displayIconSpec = resolveActionProjectIconSpec(icon);
  const titleTrim = title.trim();
  const descriptionTrim = (description ?? "").trim();
  const catalog = useDesignerCatalogContext();

  return (
    <header
      className={["project-info-header", "action-project-meta-summary", className]
        .filter(Boolean)
        .join(" ")}
    >
      {catalog ? <div className="project-info-icon-wrap project-info-icon-wrap--static" role="img" aria-label={titleTrim || "动作图标"}>
        <IconControl spec={displayIconSpec} size={36} className="project-info-icon" title={titleTrim || undefined} />
      </div> : <FaIconProvider specs={[displayIconSpec]}>
        <div className="project-info-icon-wrap project-info-icon-wrap--static">
          <ActionIcon spec={displayIconSpec} className="project-info-icon" title={titleTrim || undefined} />
        </div>
      </FaIconProvider>}
      <div className="project-info-heading">
        <h2 className="project-info-title">{titleTrim || "（无标题）"}</h2>
        {descriptionTrim ? (
          <p className="action-project-meta-summary-description">{descriptionTrim}</p>
        ) : null}
      </div>
    </header>
  );
}
