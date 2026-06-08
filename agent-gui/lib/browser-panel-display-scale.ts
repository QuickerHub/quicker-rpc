/** Max device pixel ratio for embedded browser screencast (matches browser-runtime cap). */
export const BROWSER_PANEL_MAX_DEVICE_SCALE = 3;

/** Clamp host display DPR for screencast capture. */
export function browserPanelDeviceScaleFactor(): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return Math.min(BROWSER_PANEL_MAX_DEVICE_SCALE, Math.max(1, dpr));
}
