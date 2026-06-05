/** Interactive launcher regions that must receive pointer events (not click-through). */
export const LAUNCHER_HIT_TARGET_ATTR = "data-launcher-hit";

export const LAUNCHER_HIT_TARGET_SELECTOR = [
  `[${LAUNCHER_HIT_TARGET_ATTR}]`,
  ".titlebar-drag-region",
  ".tool-selector-panel",
  ".action-tag-selector-panel",
  ".model-picker-float--portal",
  ".composer-popup",
].join(", ");

export function isLauncherHitTarget(element: Element | null): boolean {
  return element?.closest(LAUNCHER_HIT_TARGET_SELECTOR) != null;
}
