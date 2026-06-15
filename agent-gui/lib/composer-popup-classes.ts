/** Shared class for portaled `.composer-popup` menus (elevation + z-index in globals.css). */
export const COMPOSER_POPUP_PORTAL_CLASS = "composer-popup-portal";

export function composerPopupPortalClassNames(...extra: string[]): string {
  return ["composer-popup", COMPOSER_POPUP_PORTAL_CLASS, ...extra]
    .filter(Boolean)
    .join(" ");
}
