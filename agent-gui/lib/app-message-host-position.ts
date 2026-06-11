/**
 * Native child webviews (Electron WebContentsView / Tauri WebView2) always draw
 * above HTML, so the bottom-right toast stack must move out of their bounds
 * instead of relying on z-index.
 */

export type RectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type AppMessageHostOffset = {
  right: number;
  bottom: number;
};

/** Matches .app-message-host CSS: right/bottom 1rem, width min(22rem, 100vw - 2rem). */
const MARGIN = 16;
const AVOID_GAP = 12;
const TOAST_MAX_WIDTH = 352;

export const DEFAULT_APP_MESSAGE_HOST_OFFSET: AppMessageHostOffset = {
  right: MARGIN,
  bottom: MARGIN,
};

function intersects(a: RectLike, b: RectLike): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Compute the toast stack offset so it does not sit under any native webview rect.
 * Prefers sliding left of the webview; falls back to above it; otherwise keeps default.
 */
export function computeAppMessageHostOffset(args: {
  webviewRects: readonly RectLike[];
  viewportWidth: number;
  viewportHeight: number;
  /** Current rendered height of the toast stack (px). */
  stackHeight: number;
}): AppMessageHostOffset {
  const { webviewRects, viewportWidth, viewportHeight } = args;
  const stackHeight = Math.max(args.stackHeight, 1);
  const toastWidth = Math.min(TOAST_MAX_WIDTH, viewportWidth - MARGIN * 2);

  const defaultRegion: RectLike = {
    left: viewportWidth - MARGIN - toastWidth,
    right: viewportWidth - MARGIN,
    top: viewportHeight - MARGIN - stackHeight,
    bottom: viewportHeight - MARGIN,
  };

  const blocking = webviewRects.filter((rect) => intersects(rect, defaultRegion));
  if (blocking.length === 0) return DEFAULT_APP_MESSAGE_HOST_OFFSET;

  const minLeft = Math.min(...blocking.map((rect) => rect.left));
  const shiftedRight = viewportWidth - minLeft + AVOID_GAP;
  if (viewportWidth - shiftedRight - toastWidth >= MARGIN) {
    return { right: shiftedRight, bottom: MARGIN };
  }

  const minTop = Math.min(...blocking.map((rect) => rect.top));
  const shiftedBottom = viewportHeight - minTop + AVOID_GAP;
  if (viewportHeight - shiftedBottom - stackHeight >= MARGIN) {
    return { right: MARGIN, bottom: shiftedBottom };
  }

  return DEFAULT_APP_MESSAGE_HOST_OFFSET;
}
