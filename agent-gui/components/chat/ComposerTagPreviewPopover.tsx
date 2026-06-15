"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  COMPOSER_TAG_PREVIEW_WIDTH,
  computeComposerTagPreviewLayout,
} from "@/lib/composer-tag-preview-layout";
import type { ComposerTagPreviewModel } from "@/lib/composer-tag-preview";

type ComposerTagPreviewPopoverProps = {
  open: boolean;
  anchorRect: DOMRect | null;
  model: ComposerTagPreviewModel | null;
  /** Keep preview open while the pointer is over the panel (scroll wheel, etc.). */
  onPanelHoverChange?: (hovering: boolean) => void;
};

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

function readViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return DEFAULT_VIEWPORT;
  return { width: window.innerWidth, height: window.innerHeight };
}

function badgeClass(kind: ComposerTagPreviewModel["kind"]): string {
  switch (kind) {
    case "browser-element":
      return "composer-tag-preview__badge--browser";
    case "program-step":
      return "composer-tag-preview__badge--program-step";
    case "subprogram":
      return "composer-tag-preview__badge--subprogram";
    default:
      return "composer-tag-preview__badge--action";
  }
}

export function ComposerTagPreviewPopover({
  open,
  anchorRect,
  model,
  onPanelHoverChange,
}: ComposerTagPreviewPopoverProps) {
  const panelId = useId();
  const [viewport, setViewport] = useState(readViewportSize);

  useEffect(() => {
    if (!open) return;
    const sync = () => setViewport(readViewportSize());
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open]);

  const style = useMemo(() => {
    if (!open || !anchorRect || !model) return undefined;
    const layout = computeComposerTagPreviewLayout(anchorRect, viewport);
    return {
      top: layout.top,
      left: layout.left,
      width: Math.min(
        COMPOSER_TAG_PREVIEW_WIDTH,
        viewport.width - 16,
      ),
      maxHeight: layout.maxHeight,
      transform: layout.transform,
    } as const;
  }, [anchorRect, model, open, viewport]);

  if (!open || !model || !style || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      id={panelId}
      className="composer-popup composer-tag-preview composer-tag-preview--portal"
      style={style}
      role="tooltip"
      aria-label={`${model.badge}：${model.title}`}
      onMouseEnter={() => onPanelHoverChange?.(true)}
      onMouseLeave={() => onPanelHoverChange?.(false)}
    >
      <header className="composer-tag-preview__head">
        <span className={`composer-tag-preview__badge ${badgeClass(model.kind)}`}>
          {model.badge}
        </span>
        <span className="composer-tag-preview__title" title={model.title}>
          {model.title}
        </span>
      </header>
      <div className="composer-tag-preview__body">
        {model.rows.length > 0 ? (
          <dl className="composer-tag-preview__rows">
            {model.rows.map((row, index) => (
              <div key={`${row.label}-${index}`} className="composer-tag-preview__row">
                <dt>{row.label}</dt>
                <dd
                  className={row.mono ? "composer-tag-preview__value--mono" : undefined}
                  title={row.value}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {model.code ? (
          <pre className="composer-tag-preview__code">
            <code>{model.code}</code>
          </pre>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
