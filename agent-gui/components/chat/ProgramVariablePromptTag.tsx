"use client";
import type { ProgramVariableTag } from "@/lib/program-variable-tag";
import { buildProgramVariableTagPreview } from "@/lib/composer-tag-preview";
import { ComposerTagPreviewTrigger } from "./ComposerTagPreviewTrigger";
export function ProgramVariablePromptTag({ tag, variant = "composer" }: { tag: ProgramVariableTag; variant?: "composer" | "sent" }) {
  const className = `composer-prompt-tag composer-prompt-tag--program-variable${variant === "sent" ? " composer-prompt-tag--sent" : ""}`;
  const title = <span className="composer-prompt-tag__title">{tag.chipTitle}</span>;
  return variant === "sent" ? <ComposerTagPreviewTrigger className={className} model={buildProgramVariableTagPreview(tag)}>{title}</ComposerTagPreviewTrigger>
    : <span className={className}>{title}</span>;
}
