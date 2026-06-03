"use client";

import { isFaIconSpec, isHttpIconUrl } from "@/lib/fa-icon";
import { useFaIconGeometry } from "@/lib/use-fa-icon-geometry";

export type ActionIconProps = {
  spec?: string;
  className?: string;
  /** Shown on SVG / image for accessibility. */
  title?: string;
};

function ActionIconPlaceholder({ className }: { className?: string }) {
  return (
    <svg
      className={`action-icon action-icon--placeholder${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="currentColor"
        opacity="0.5"
        d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"
      />
    </svg>
  );
}

function FaSvgIcon({
  geometry,
  className,
  title,
}: {
  geometry: NonNullable<ReturnType<typeof useFaIconGeometry>>;
  className?: string;
  title?: string;
}) {
  const fill = geometry.color ?? "currentColor";
  const label =
    title
    ?? (geometry.label ? `${geometry.label} (${geometry.spec})` : geometry.spec);

  return (
    <svg
      className={`action-icon action-icon--svg${className ? ` ${className}` : ""}`}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      role="img"
      aria-label={label}
    >
      <path fill={fill} d={geometry.path} />
    </svg>
  );
}

/**
 * Renders Quicker action icons: HTTP URL, fa:Light_* spec (cached geometry), or placeholder.
 */
export function ActionIcon({ spec, className, title }: ActionIconProps) {
  const trimmed = spec?.trim();
  const faSpec = trimmed && isFaIconSpec(trimmed) ? trimmed : undefined;
  const geometry = useFaIconGeometry(faSpec);

  if (!trimmed) {
    return <ActionIconPlaceholder className={className} />;
  }

  if (isHttpIconUrl(trimmed)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Quicker CDN icon URLs are external
      <img
        src={trimmed}
        alt={title ?? ""}
        className={`action-icon action-icon--img${className ? ` ${className}` : ""}`}
      />
    );
  }

  if (!isFaIconSpec(trimmed)) {
    return <ActionIconPlaceholder className={className} />;
  }

  if (!geometry) {
    return <ActionIconPlaceholder className={className} />;
  }

  return <FaSvgIcon geometry={geometry} className={className} title={title} />;
}

/** Static chat snapshot icon: never resolves FA geometry or fetches remote data. */
export function ActionIconSnapshot({ spec, className, title }: ActionIconProps) {
  const trimmed = spec?.trim();
  return (
    <span
      className={`action-icon action-icon--placeholder${className ? ` ${className}` : ""}`}
      title={title ?? trimmed}
      aria-hidden
    />
  );
}
