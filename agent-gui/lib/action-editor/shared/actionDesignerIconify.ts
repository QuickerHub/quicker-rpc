import type { IconifyIcon } from "@iconify/types";
import { FA_FALLBACK_BUNDLED_ICONS } from "./faFallbackBundledIcons";
import { RES_ICON_BUNDLED } from "./resIconCatalog";
import broom from "@iconify/icons-mdi/broom";
import deleteOutline from "@iconify/icons-mdi/delete-outline";
import drawPen from "@iconify/icons-mdi/draw-pen";
import download from "@iconify/icons-mdi/download";
import filter from "@iconify/icons-mdi/filter";
import plus from "@iconify/icons-mdi/plus";
import shieldLock from "@iconify/icons-mdi/shield-lock";
import redo from "@iconify/icons-mdi/redo";
import swapVertical from "@iconify/icons-mdi/swap-vertical";
import undo from "@iconify/icons-mdi/undo";
import unfoldLessHorizontal from "@iconify/icons-mdi/unfold-less-horizontal";
import upload from "@iconify/icons-mdi/upload";

/**
 * Bundled Iconify icons (offline, no /api/icons round-trip).
 * Spec format in IconControl: `iconify:` + icon id, e.g. `iconify:mdi:shield-lock`.
 */
export const ACTION_DESIGNER_BUNDLED_ICONIFY: Record<string, IconifyIcon> = {
  ...FA_FALLBACK_BUNDLED_ICONS,
  "mdi:plus": plus,
  "mdi:delete-outline": deleteOutline,
  "mdi:draw-pen": drawPen,
  "mdi:broom": broom,
  "mdi:swap-vertical": swapVertical,
  "mdi:filter": filter,
  "mdi:shield-lock": shieldLock,
  "mdi:download": download,
  "mdi:upload": upload,
  "mdi:unfold-less-horizontal": unfoldLessHorizontal,
  "mdi:undo": undo,
  "mdi:redo": redo
};

export function getBundledIconifyIcon(iconId: string): IconifyIcon | undefined {
  return RES_ICON_BUNDLED[iconId] ?? ACTION_DESIGNER_BUNDLED_ICONIFY[iconId];
}

/** `iconify:` + id strings for IconControl (bundled MDI subset). */
export const AD_ICONIFY_SPEC = {
  plus: "iconify:mdi:plus",
  deleteOutline: "iconify:mdi:delete-outline",
  broom: "iconify:mdi:broom",
  swapVertical: "iconify:mdi:swap-vertical",
  filter: "iconify:mdi:filter",
  shieldLock: "iconify:mdi:shield-lock",
  /** Arrow into baseline (input). */
  variableInput: "iconify:mdi:download",
  /** Arrow from baseline (output). */
  variableOutput: "iconify:mdi:upload",
  toolboxCollapseAll: "iconify:mdi:unfold-less-horizontal",
  undo: "iconify:mdi:undo",
  redo: "iconify:mdi:redo",
  /** Home / entry cards: open action designer. */
  actionDesignerCard: "iconify:mdi:draw-pen"
} as const;
