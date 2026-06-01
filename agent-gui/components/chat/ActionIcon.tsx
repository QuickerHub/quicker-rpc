"use client";

import { isFaIconSpec } from "@/lib/fa-icon";
import { useFaIconGeometry } from "./FaIconProvider";

type ActionIconProps = {
  spec?: string;
  className?: string;
};

export function ActionIcon({ spec, className }: ActionIconProps) {
  const trimmed = spec?.trim();
  if (!trimmed || !isFaIconSpec(trimmed)) {
    return <span className={`action-icon action-icon--empty${className ? ` ${className}` : ""}`} aria-hidden />;
  }

  const geometry = useFaIconGeometry(trimmed);
  if (!geometry) {
    return (
      <span
        className={`action-icon action-icon--loading${className ? ` ${className}` : ""}`}
        title={trimmed}
        aria-hidden
      />
    );
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
