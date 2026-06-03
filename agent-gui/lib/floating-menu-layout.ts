/** Viewport-fixed placement for small anchored menus (delete menu, etc.). */

export type FloatingMenuLayout = {
  top: number;
  left: number;
  maxHeight: number;
  transform?: string;
};

const GAP_PX = 4;
const VIEWPORT_PAD_PX = 8;
const MIN_MENU_HEIGHT_PX = 72;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Align menu end (right edge) with anchor end; flip above when needed. */
export function computeFloatingMenuLayout(
  anchor: DOMRect,
  menuWidth: number,
  menuMaxHeight = 280,
): FloatingMenuLayout {
  const width = Math.min(
    menuWidth,
    window.innerWidth - 2 * VIEWPORT_PAD_PX,
  );
  const left = clamp(
    anchor.right - width,
    VIEWPORT_PAD_PX,
    window.innerWidth - width - VIEWPORT_PAD_PX,
  );

  const spaceBelow =
    window.innerHeight - anchor.bottom - GAP_PX - VIEWPORT_PAD_PX;
  const spaceAbove = anchor.top - GAP_PX - VIEWPORT_PAD_PX;
  const placeBelow =
    spaceBelow >= spaceAbove
    || (spaceBelow >= MIN_MENU_HEIGHT_PX && spaceAbove < MIN_MENU_HEIGHT_PX);

  if (placeBelow) {
    return {
      top: anchor.bottom + GAP_PX,
      left,
      maxHeight: Math.min(
        menuMaxHeight,
        Math.max(MIN_MENU_HEIGHT_PX, spaceBelow),
      ),
    };
  }

  return {
    top: anchor.top - GAP_PX,
    left,
    maxHeight: Math.min(
      menuMaxHeight,
      Math.max(MIN_MENU_HEIGHT_PX, spaceAbove),
    ),
    transform: "translateY(-100%)",
  };
}
