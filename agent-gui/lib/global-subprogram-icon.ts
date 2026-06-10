/** Default FA glyph for Quicker global (%%) subprograms; color from global-subprogram CSS. */
export const DEFAULT_GLOBAL_SUBPROGRAM_FA_ICON = "fa:Solid_Cubes";

export function isGlobalSubProgramIdentifier(ident: string): boolean {
  return ident.trim().startsWith("%%");
}

export function resolveGlobalSubProgramIconSpec(icon?: string): string {
  const trimmed = icon?.trim();
  return trimmed || DEFAULT_GLOBAL_SUBPROGRAM_FA_ICON;
}

/** Action editor step rows / subprogram list leading icon. */
export const GLOBAL_SUBPROGRAM_ICON_CLASS = "icon icon--global-subprogram";

/** Chat composer @-mention picker item icon. */
export const MENTION_GLOBAL_SUBPROGRAM_ICON_CLASS =
  "action-picker-item-icon action-picker-item-icon--global-subprogram";

/** Inline composer / sent-message tag icon for global subprograms. */
export const COMPOSER_SUBPROGRAM_TAG_ICON_CLASS =
  "composer-prompt-tag__icon composer-prompt-tag__icon--fa composer-prompt-tag__icon--subprogram";
