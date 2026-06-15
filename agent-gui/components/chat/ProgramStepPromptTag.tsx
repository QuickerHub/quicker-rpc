"use client";

import { ComposerTagPreviewTrigger } from "@/components/chat/ComposerTagPreviewTrigger";
import type { ProgramStepTag } from "@/lib/program-step-tag";
import { buildProgramStepTagPreview } from "@/lib/composer-tag-preview";

type ProgramStepPromptTagProps = {
  tag: ProgramStepTag;
  variant?: "composer" | "sent";
};

export function ProgramStepPromptTag({
  tag,
  variant = "composer",
}: ProgramStepPromptTagProps) {
  const className = `composer-prompt-tag composer-prompt-tag--program-step${
    variant === "sent" ? " composer-prompt-tag--sent" : ""
  }`;

  const chip = (
    <>
      <span
        className="composer-prompt-tag__icon composer-prompt-tag__icon--program-step"
        aria-hidden
      >
        ⌗
      </span>
      <span className="composer-prompt-tag__title">{tag.chipTitle}</span>
    </>
  );

  if (variant !== "sent") {
    return <span className={className}>{chip}</span>;
  }

  return (
    <ComposerTagPreviewTrigger
      model={buildProgramStepTagPreview(tag)}
      className={className}
    >
      {chip}
    </ComposerTagPreviewTrigger>
  );
}
