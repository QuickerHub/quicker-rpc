"use client";

import type { ReactNode, RefObject } from "react";
import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { faVectorSpecToBundledIconifyId } from "./faVectorToIconifyFallback";
import { FaVectorSvg, IconEmptyPlaceholder, iconSlotFrameStyle } from "./FaVectorSvg";
import { IconifyIconSlot } from "./IconifyIconSlot";
import {
  buildResIconRequestUrl,
  parseHttpOrHttpsIconUrl,
  parseQuickerAssetIcon
} from "./parseQuickerAssetIcon";
import { parseIconifyIconId } from "./parseIconifySpec";

export type IconControlProps = {
  spec?: string | null;
  size?: number;
  className?: string;
  /** Shown when icon cannot be resolved; null/undefined = empty slot (no ◈ flash while loading) */
  fallback?: ReactNode | null;
  title?: string;
  /** Unused for bundled `res:` static URLs. Passed through for `fa:` vector fetch cache key / URL. */
  resourceBaseUrl?: string;
};

function useRasterIconLoadState(src: string | null): {
  imgRef: RefObject<HTMLImageElement | null>;
  imgBroken: boolean;
  imgLoaded: boolean;
  onLoad: () => void;
  onError: () => void;
} {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgBroken, setImgBroken] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useLayoutEffect(() => {
    setImgBroken(false);
    const img = imgRef.current;
    if (!src || !img) {
      setImgLoaded(false);
      return;
    }
    if (img.complete) {
      const ok = img.naturalWidth > 0;
      setImgLoaded(ok);
      setImgBroken(!ok);
    } else {
      setImgLoaded(false);
    }
  }, [src]);

  const onLoad = useCallback(() => {
    setImgLoaded(true);
    setImgBroken(false);
  }, []);

  const onError = useCallback(() => {
    setImgLoaded(false);
    setImgBroken(true);
  }, []);

  return { imgRef, imgBroken, imgLoaded, onLoad, onError };
}

/**
 * Renders Quicker icon strings:
 * - `http(s)://` remote image URL (native img; on error uses fallback)
 * - `res:` PNG via /api/icons/res (bundled Quicker Assets PNGs; SVG fallback when missing)
 * - `fa:` Font Awesome vector via backend (/api/icons/fa-vector); on miss/error uses bundled MDI fallback
 * - `iconify:` explicit bundled Iconify id (no backend)
 */
export const IconControl = memo(function IconControl({
  spec,
  size = 14,
  className,
  fallback = null,
  title,
  resourceBaseUrl = ""
}: IconControlProps): JSX.Element {
  const trimmedSpec = (spec ?? "").trim();
  const httpIconUrl = parseHttpOrHttpsIconUrl(spec);
  const asset = parseQuickerAssetIcon(spec);
  const rasterSrc = httpIconUrl ?? (asset ? buildResIconRequestUrl(asset.path) : null);
  const { imgRef, imgBroken, imgLoaded, onLoad, onError } = useRasterIconLoadState(rasterSrc);

  if (!trimmedSpec) {
    return <IconEmptyPlaceholder size={size} className={className} title={title} />;
  }

  if (httpIconUrl && !imgBroken) {
    return (
      <span className={className} title={title} style={{ ...iconSlotFrameStyle(size), position: "relative" }}>
        <img
          ref={imgRef}
          src={httpIconUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          draggable={false}
          style={{
            objectFit: "contain",
            display: "block",
            maxWidth: "100%",
            maxHeight: "100%",
            opacity: imgLoaded ? 1 : 0,
          }}
          onLoad={onLoad}
          onError={onError}
        />
      </span>
    );
  }

  if (httpIconUrl && imgBroken) {
    if (fallback === null || fallback === undefined) {
      return <IconEmptyPlaceholder size={size} className={className} title={title} />;
    }
    return (
      <span
        className={className}
        title={title}
        style={{
          ...iconSlotFrameStyle(size),
          fontSize: Math.max(10, size - 2)
        }}
      >
        {fallback}
      </span>
    );
  }

  if (asset && !imgBroken) {
    const src = buildResIconRequestUrl(asset.path);
    return (
      <span
        className={className}
        title={title}
        style={{ ...iconSlotFrameStyle(size), position: "relative" }}
      >
        <img
          ref={imgRef}
          src={src}
          alt=""
          width={size}
          height={size}
          draggable={false}
          style={{
            objectFit: "contain",
            display: "block",
            maxWidth: "100%",
            maxHeight: "100%",
            opacity: imgLoaded ? 1 : 0,
          }}
          onLoad={onLoad}
          onError={onError}
        />
      </span>
    );
  }

  const iconifyId = parseIconifyIconId(spec);
  if (iconifyId) {
    return (
      <IconifyIconSlot
        iconId={iconifyId}
        size={size}
        className={className}
        title={title}
        fallback={fallback}
      />
    );
  }

  // Do not parse res: / asset paths as fa: (colon breaks fa body into "res" + garbage).
  if (asset && imgBroken) {
    if (fallback === null || fallback === undefined) {
      return <IconEmptyPlaceholder size={size} className={className} title={title} />;
    }
    return (
      <span
        className={className}
        title={title}
        style={{
          ...iconSlotFrameStyle(size),
          fontSize: Math.max(10, size - 2)
        }}
      >
        {fallback}
      </span>
    );
  }

  const fa = spec?.trim() ?? "";
  if (fa.length > 3 && fa.toLowerCase().startsWith("fa:")) {
    return (
      <FaVectorSvg
        spec={fa}
        size={size}
        className={className}
        title={title}
        fallback={fallback}
        resourceBaseUrl={resourceBaseUrl}
        iconifyFallbackId={faVectorSpecToBundledIconifyId(fa)}
      />
    );
  }

  if (fallback === null || fallback === undefined) {
    return <IconEmptyPlaceholder size={size} className={className} title={title} />;
  }
  return (
    <span
      className={className}
      title={title}
      style={{
        ...iconSlotFrameStyle(size),
        fontSize: Math.max(10, size - 2)
      }}
    >
      {fallback}
    </span>
  );
});
