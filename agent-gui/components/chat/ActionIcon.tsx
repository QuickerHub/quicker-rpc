"use client";

import { isFaIconSpec } from "@/lib/fa-icon";
import { useFaIconGeometry } from "./FaIconProvider";

type ActionIconProps = {
  spec?: string;
  className?: string;
};

function ActionIconPlaceholder({ className }: { className?: string }) {
  return (
    <span
      className={`action-icon action-icon--placeholder${className ? ` ${className}` : ""}`}
      aria-hidden
    />
  );
}

export function ActionIcon({ spec, className }: ActionIconProps) {
  const trimmed = spec?.trim();
  if (!trimmed || !isFaIconSpec(trimmed)) {
    return <ActionIconPlaceholder className={className} />;
  }

  const geometry = useFaIconGeometry(trimmed);
  if (!geometry) {
    return <ActionIconPlaceholder className={className} />;
  }

  const fill = geometry.color ?? "currentColor";
  const title = geometry.label
    ? `${geometry.label} (${trimmed})`
    : trimmed;

  return (
    <svg
      className={`action-icon action-icon--svg${className ? ` ${className}` : ""}`}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      role="img"
      aria-label={title}
    >
      <path fill={fill} d={geometry.path} />
    </svg>
  );
}
