"use client";

import type { CSSProperties, ReactNode } from "react";
import { memo, useEffect, useState } from "react";
import { faIconGeometryFill, type FaIconGeometry } from "@/lib/fa-icon";
import { ensureFaIconsResolved, flushFaIconCache, getFaIconFromCache } from "@/lib/fa-icon-cache";
import { useFaIconGeometry } from "@/lib/use-fa-icon-geometry";
import { getBundledIconifyIcon } from "./actionDesignerIconify";
import { IconifyIconSlot } from "./IconifyIconSlot";
import { useDesignerCatalogContext } from "../catalog/DesignerCatalogProvider";
import type { DesignerCatalogPort } from "../catalog/designerCatalogPort";
import { readDesignerFaGeometry, resolveDesignerFaIcons } from "../catalog/designerFaGeometry";

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
  const fill = faIconGeometryFill(geometry);

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
function LegacyFaVectorSvg({
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
}

function ScopedFaVectorSvg({ spec, size = 14, className, title, fallback, iconifyFallbackId = null,
  port }: FaVectorSvgProps & { port?: DesignerCatalogPort }): JSX.Element {
  const key = spec.trim();
  const [result, setResult] = useState<{ port: DesignerCatalogPort; key: string; failed: boolean } | null>(null);
  const geometry = port?.remoteEnabled ? readDesignerFaGeometry(port, key) : undefined;
  useEffect(() => {
    if (!port?.remoteEnabled || !key.toLowerCase().startsWith("fa:")) return;
    const controller = new AbortController();
    void resolveDesignerFaIcons(port, [key], controller.signal).then((items) => {
      if (!controller.signal.aborted) setResult({ port, key, failed: items.length === 0 });
    }, () => {
      if (!controller.signal.aborted) setResult({ port, key, failed: true });
    });
    return () => controller.abort();
  }, [port, key]);

  if (geometry?.path) return <FaGeometrySvg geometry={geometry} size={size} className={className} title={title} />;
  // A loading/unbound document never consults global geometry, persistence or another host.
  if (!port?.remoteEnabled || result?.port !== port || result.key !== key || !result.failed)
    return <IconEmptyPlaceholder size={size} className={className} title={title} />;
  if (iconifyFallbackId && getBundledIconifyIcon(iconifyFallbackId)) return <IconifyIconSlot
    iconId={iconifyFallbackId} size={size} className={className} title={title} fallback={fallback ?? null} />;
  return renderFallbackNode(fallback, size, className, title);
}

/** A document provider owns FA geometry, including portals; independent workbench icons retain their legacy cache. */
export const FaVectorSvg = memo(function FaVectorSvg(props: FaVectorSvgProps): JSX.Element {
  const context = useDesignerCatalogContext();
  return context ? <ScopedFaVectorSvg {...props} port={context.port} /> : <LegacyFaVectorSvg {...props} />;
});
