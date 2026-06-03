"use client";

import type { CSSProperties, ReactNode } from "react";
import { memo, useEffect, useState } from "react";
import type { FaIconGeometry } from "@/lib/fa-icon";
import { ensureFaIconsResolved, flushFaIconCache, getFaIconFromCache } from "@/lib/fa-icon-cache";
import { useFaIconGeometry } from "@/lib/use-fa-icon-geometry";
import { getBundledIconifyIcon } from "./actionDesignerIconify";
import { IconifyIconSlot } from "./IconifyIconSlot";

/** Fixed-size frame for icon slots (empty, loading, fallback text, or SVG). */
export function iconSlotFrameStyle(size: number): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    flexShrink: 0,
    width: size,
    height: size,
  };
}

/** Reserved icon slot while spec or FA geometry is still loading. */
export function IconEmptyPlaceholder({
  size,
  className,
  title,
}: {
  size: number;
  className?: string;
  title?: string;
}): JSX.Element {
  return (
    <span
      className={className}
      title={title}
      style={iconSlotFrameStyle(size)}
      aria-hidden
    />
  );
}

export type FaVectorSvgProps = {
  spec: string;
  size?: number;
  className?: string;
  title?: string;
  fallback?: ReactNode;
  resourceBaseUrl?: string;
  iconifyFallbackId?: string | null;
};

function FaGeometrySvg({
  geometry,
  size,
  className,
  title,
}: {
  geometry: FaIconGeometry;
  size: number;
  className?: string;
  title?: string;
}): JSX.Element {
  const w = geometry.width > 0 ? geometry.width : 512;
  const h = geometry.height > 0 ? geometry.height : 512;
  const fill = geometry.color?.trim() || "currentColor";

  return (
    <span className={className} title={title} style={iconSlotFrameStyle(size)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={size}
        height={size}
        aria-hidden
        style={{ display: "block", maxWidth: "100%", maxHeight: "100%" }}
      >
        <path d={geometry.path} fill={fill} />
      </svg>
    </span>
  );
}

function renderFallbackNode(
  fallback: ReactNode | undefined,
  size: number,
  className?: string,
  title?: string
): JSX.Element {
  if (fallback === null || fallback === undefined || fallback === false) {
    return <IconEmptyPlaceholder size={size} className={className} title={title} />;
  }
  return (
    <span
      className={className}
      title={title}
      style={{
        ...iconSlotFrameStyle(size),
        fontSize: Math.max(10, size - 2),
      }}
    >
      {fallback}
    </span>
  );
}

/**
 * Renders Quicker fa:… icons via /api/fa/resolve (shared fa-icon-cache with chat ActionIcon).
 */
export const FaVectorSvg = memo(function FaVectorSvg({
  spec,
  size = 14,
  className,
  title,
  fallback,
  iconifyFallbackId = null,
}: FaVectorSvgProps): JSX.Element {
  const key = spec.trim();
  const faSpec = key.toLowerCase().startsWith("fa:") ? key : undefined;
  const geometry = useFaIconGeometry(faSpec);
  const [resolveFailed, setResolveFailed] = useState(false);

  useEffect(() => {
    if (!faSpec) {
      setResolveFailed(false);
      return;
    }
    if (getFaIconFromCache(faSpec)) {
      setResolveFailed(false);
      return;
    }
    setResolveFailed(false);
    ensureFaIconsResolved([faSpec]);
    let cancelled = false;
    void flushFaIconCache().then(() => {
      if (!cancelled && !getFaIconFromCache(faSpec)) {
        setResolveFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [faSpec]);

  if (geometry?.path) {
    return <FaGeometrySvg geometry={geometry} size={size} className={className} title={title} />;
  }

  if (faSpec && !resolveFailed) {
    return <IconEmptyPlaceholder size={size} className={className} title={title} />;
  }

  const resolvedFallbackId =
    iconifyFallbackId && getBundledIconifyIcon(iconifyFallbackId) ? iconifyFallbackId : null;

  if (resolvedFallbackId) {
    return (
      <IconifyIconSlot
        iconId={resolvedFallbackId}
        size={size}
        className={className}
        title={title}
        fallback={fallback ?? null}
      />
    );
  }

  return renderFallbackNode(fallback, size, className, title);
});
