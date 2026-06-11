/** Viewport-fixed layout for tag preview popup (aligned with @-mention menu). */
export type ComposerTagPreviewLayout = {
  top: number;
  left: number;
  maxHeight: number;
  transform?: string;
  placement: "above" | "below";
};

const GAP_PX = 4;
const VIEWPORT_PAD_PX = 8;
/** Matches `width: min(22rem, …)` at 16px root. */
const PANEL_WIDTH_PX = 352;
/** Upper bound similar to action-picker / mention menus. */
const PANEL_ABS_MAX_HEIGHT_PX = 256;
const MIN_PANEL_HEIGHT_PX = 64;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeComposerTagPreviewLayout(
  anchorRect: DOMRect,
  viewport: { width: number; height: number },
): ComposerTagPreviewLayout {
  const panelWidth = Math.min(
    PANEL_WIDTH_PX,
    viewport.width - 2 * VIEWPORT_PAD_PX,
  );
  const left = clamp(
    anchorRect.left,
    VIEWPORT_PAD_PX,
    viewport.width - panelWidth - VIEWPORT_PAD_PX,
  );

  const spaceBelow =
    viewport.height - anchorRect.bottom - GAP_PX - VIEWPORT_PAD_PX;
  const spaceAbove = anchorRect.top - GAP_PX - VIEWPORT_PAD_PX;

  const placeBelow =
    spaceBelow >= spaceAbove
    || (spaceBelow >= MIN_PANEL_HEIGHT_PX && spaceAbove < MIN_PANEL_HEIGHT_PX);

  if (placeBelow) {
    return {
      top: anchorRect.bottom + GAP_PX,
      left,
      maxHeight: Math.min(
        PANEL_ABS_MAX_HEIGHT_PX,
        Math.max(MIN_PANEL_HEIGHT_PX, spaceBelow),
      ),
      placement: "below",
    };
  }

  return {
    top: anchorRect.top - GAP_PX,
    left,
    maxHeight: Math.min(
      PANEL_ABS_MAX_HEIGHT_PX,
      Math.max(MIN_PANEL_HEIGHT_PX, spaceAbove),
    ),
    transform: "translateY(-100%)",
    placement: "above",
  };
}

export const COMPOSER_TAG_PREVIEW_WIDTH = PANEL_WIDTH_PX;
