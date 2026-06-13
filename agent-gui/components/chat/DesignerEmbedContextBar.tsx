"use client";

import { useMemo } from "react";
import {
  designerContextTitle,
  resolveDesignerWindowContext,
} from "@/lib/designer-embed-layout";
import { formatDesignerStepMentionTitle } from "@/lib/designer-mention-items";
import { useActionDesignerEmbed } from "@/lib/designer-embed-context";
import { useDesignerContext } from "@/lib/use-designer-context";

export function DesignerEmbedContextBar() {
  const embed = useActionDesignerEmbed();
  const snapshot = useDesignerContext(embed.scoped);

  const windowContext = useMemo(
    () => resolveDesignerWindowContext(snapshot, embed),
    [snapshot, embed],
  );

  if (!embed.scoped) return null;

  const title = designerContextTitle(windowContext, embed);
  const selectedSteps = windowContext?.selectedSteps ?? [];
  const kindLabel = embed.isSubProgram ? "子程序" : "动作";

  return (
    <div className="designer-embed-context-bar" aria-label="设计器上下文">
      <div className="designer-embed-context-bar__main">
        <span className="designer-embed-context-bar__kind">{kindLabel}</span>
        <span className="designer-embed-context-bar__title" title={title}>
          {title}
        </span>
      </div>
      {selectedSteps.length > 0 ? (
        <div className="designer-embed-context-bar__steps" aria-label="选中步骤">
          {selectedSteps.slice(0, 2).map((step) => (
            <span
              key={`${step.index}:${step.stepId ?? step.stepRunnerKey ?? ""}`}
              className="designer-embed-context-bar__step"
              title={formatDesignerStepMentionTitle(step)}
            >
              {formatDesignerStepMentionTitle(step)}
            </span>
          ))}
          {selectedSteps.length > 2 ? (
            <span className="designer-embed-context-bar__step-more">
              +{selectedSteps.length - 2}
            </span>
          ) : null}
        </div>
      ) : (
        <span className="designer-embed-context-bar__hint">
          选中步骤后输入 @ 可引用
        </span>
      )}
    </div>
  );
}
