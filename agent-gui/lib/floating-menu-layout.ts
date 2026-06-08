/** Viewport-fixed placement for small anchored menus (delete menu, etc.). */

export type FloatingMenuLayout = {
  top: number;
  left: number;
  maxHeight: number;
  transform?: string;
};

export type FlyoutDetailLayout = {
  top: number;
  left: number;
  maxHeight: number;
  /** Detail panel sits to the left or right of the anchor panel. */
  side: "left" | "right";
};

export type FloatingMenuAlign = "start" | "end";

const GAP_PX = 4;
const VIEWPORT_PAD_PX = 8;
const MIN_MENU_HEIGHT_PX = 72;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export type ViewportBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Nudge a box fully inside the viewport using the smallest per-axis shifts
 * (overflow right → move left, overflow bottom → move up, etc.).
 */
export function clampBoxToViewport(
  box: ViewportBox,
  padding = VIEWPORT_PAD_PX,
): ViewportBox {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxWidth = Math.max(0, vw - 2 * padding);
  const maxHeight = Math.max(0, vh - 2 * padding);
  const width = Math.min(Math.max(0, box.width), maxWidth);
  const height = Math.min(Math.max(0, box.height), maxHeight);
  let { left, top } = box;

  if (left + width > vw - padding) {
    left = vw - padding - width;
  }
  if (left < padding) {
    left = padding;
  }
  if (top + height > vh - padding) {
    top = vh - padding - height;
  }
  if (top < padding) {
    top = padding;
  }

  return { left, top, width, height };
}

/**
 * @param align `"end"` — menu right edge with anchor right (default);
 *              `"start"` — menu left edge with anchor left.
 */
export function computeFloatingMenuLayout(
  anchor: DOMRect,
  menuWidth: number,
  menuMaxHeight = 280,
  align: FloatingMenuAlign = "end",
): FloatingMenuLayout {
  const width = Math.min(
    menuWidth,
    window.innerWidth - 2 * VIEWPORT_PAD_PX,
  );
  const left = clamp(
    align === "start" ? anchor.left : anchor.right - width,
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

/**
 * Like {@link computeFloatingMenuLayout} but uses a measured height and never
 * applies CSS transform — final box is clamped fully inside the viewport.
 */
export function computeMeasuredFloatingMenuLayout(
  anchor: DOMRect,
  menuWidth: number,
  menuHeight: number,
  menuMaxHeight = 280,
  align: FloatingMenuAlign = "end",
): FloatingMenuLayout {
  const width = Math.min(
    menuWidth,
    window.innerWidth - 2 * VIEWPORT_PAD_PX,
  );
  const left = clamp(
    align === "start" ? anchor.left : anchor.right - width,
    VIEWPORT_PAD_PX,
    window.innerWidth - width - VIEWPORT_PAD_PX,
  );

  const spaceBelow =
    window.innerHeight - anchor.bottom - GAP_PX - VIEWPORT_PAD_PX;
  const spaceAbove = anchor.top - GAP_PX - VIEWPORT_PAD_PX;
  const placeBelow =
    spaceBelow >= spaceAbove
    || (spaceBelow >= MIN_MENU_HEIGHT_PX && spaceAbove < MIN_MENU_HEIGHT_PX);

  const maxHeight = Math.min(
    menuMaxHeight,
    placeBelow
      ? Math.max(MIN_MENU_HEIGHT_PX, spaceBelow)
      : Math.max(MIN_MENU_HEIGHT_PX, spaceAbove),
  );
  const height = Math.min(
    Math.max(menuHeight, MIN_MENU_HEIGHT_PX),
    maxHeight,
  );

  const top = placeBelow
    ? anchor.bottom + GAP_PX
    : anchor.top - GAP_PX - height;

  const clamped = clampBoxToViewport({ left, top, width, height });
  return {
    top: clamped.top,
    left: clamped.left,
    maxHeight,
  };
}

/**
 * Viewport-fixed placement for a secondary flyout (e.g. model picker detail)
 * anchored beside a primary floating panel.
 */
export function computeFlyoutDetailLayout(
  anchorRect: DOMRect,
  detailWidth: number,
  detailHeight: number,
  maxHeightCap = 352,
): FlyoutDetailLayout {
  const width = Math.min(
    detailWidth,
    window.innerWidth - 2 * VIEWPORT_PAD_PX,
  );
  const height = Math.min(
    detailHeight,
    maxHeightCap,
    window.innerHeight - 2 * VIEWPORT_PAD_PX,
  );

  const spaceRight =
    window.innerWidth - anchorRect.right - GAP_PX - VIEWPORT_PAD_PX;
  const spaceLeft = anchorRect.left - GAP_PX - VIEWPORT_PAD_PX;
  const preferRight = spaceRight >= spaceLeft;

  let side: FlyoutDetailLayout["side"] = preferRight ? "right" : "left";
  let left = preferRight
    ? anchorRect.right + GAP_PX
    : anchorRect.left - GAP_PX - width;

  if (preferRight && left + width > window.innerWidth - VIEWPORT_PAD_PX) {
    const flippedLeft = anchorRect.left - GAP_PX - width;
    if (flippedLeft >= VIEWPORT_PAD_PX) {
      side = "left";
      left = flippedLeft;
    } else {
      left = clamp(
        left,
        VIEWPORT_PAD_PX,
        window.innerWidth - width - VIEWPORT_PAD_PX,
      );
    }
  } else if (!preferRight && left < VIEWPORT_PAD_PX) {
    const flippedLeft = anchorRect.right + GAP_PX;
    if (flippedLeft + width <= window.innerWidth - VIEWPORT_PAD_PX) {
      side = "right";
      left = flippedLeft;
    } else {
      left = clamp(
        left,
        VIEWPORT_PAD_PX,
        window.innerWidth - width - VIEWPORT_PAD_PX,
      );
    }
  }

  let top = anchorRect.top;
  if (top + height > window.innerHeight - VIEWPORT_PAD_PX) {
    top = window.innerHeight - VIEWPORT_PAD_PX - height;
  }
  top = clamp(top, VIEWPORT_PAD_PX, window.innerHeight - VIEWPORT_PAD_PX);

  const maxHeight = Math.min(
    maxHeightCap,
    Math.max(MIN_MENU_HEIGHT_PX, window.innerHeight - top - VIEWPORT_PAD_PX),
  );

  const clamped = clampBoxToViewport({
    left,
    top,
    width,
    height: Math.min(height, maxHeight),
  });

  return {
    top: clamped.top,
    left: clamped.left,
    maxHeight,
    side,
  };
}
