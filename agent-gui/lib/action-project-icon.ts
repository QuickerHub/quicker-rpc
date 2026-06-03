/** Default FA spec when info.json has no Icon (Quicker action icon unset). */
export const DEFAULT_ACTION_PROJECT_ICON = "fa:Light_Bolt";

export function resolveActionProjectIconSpec(icon?: string): string {
  const trimmed = icon?.trim();
  return trimmed || DEFAULT_ACTION_PROJECT_ICON;
}
