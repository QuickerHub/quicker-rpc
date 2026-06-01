/** Viewport-fixed layout for the @-mention popup, flush to the caret. */
export type MentionMenuLayout = {
  top: number;
  left: number;
  maxHeight: number;
  transform?: string;
};

const GAP_PX = 4;
const VIEWPORT_PAD_PX = 8;
/** Matches `width: min(22rem, …)` at 16px root. */
const MENU_WIDTH_PX = 352;
/** Matches `max-height: min(16rem, 40vh)` upper bound. */
const MENU_ABS_MAX_HEIGHT_PX = 256;
const MIN_MENU_HEIGHT_PX = 64;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeMentionMenuLayout(
  anchor: DOMRect,
  viewport: { width: number; height: number },
): MentionMenuLayout {
  const menuWidth = Math.min(
    MENU_WIDTH_PX,
    viewport.width - 2 * VIEWPORT_PAD_PX,
  );
  const left = clamp(
    anchor.left,
    VIEWPORT_PAD_PX,
    viewport.width - menuWidth - VIEWPORT_PAD_PX,
  );

  const spaceBelow =
    viewport.height - anchor.bottom - GAP_PX - VIEWPORT_PAD_PX;
  const spaceAbove = anchor.top - GAP_PX - VIEWPORT_PAD_PX;

  const placeBelow =
    spaceBelow >= spaceAbove
    || (spaceBelow >= MIN_MENU_HEIGHT_PX && spaceAbove < MIN_MENU_HEIGHT_PX);

  if (placeBelow) {
    return {
      top: anchor.bottom + GAP_PX,
      left,
      maxHeight: Math.min(
        MENU_ABS_MAX_HEIGHT_PX,
        Math.max(MIN_MENU_HEIGHT_PX, spaceBelow),
      ),
    };
  }

  return {
    top: anchor.top - GAP_PX,
    left,
    maxHeight: Math.min(
      MENU_ABS_MAX_HEIGHT_PX,
      Math.max(MIN_MENU_HEIGHT_PX, spaceAbove),
    ),
    transform: "translateY(-100%)",
  };
}
