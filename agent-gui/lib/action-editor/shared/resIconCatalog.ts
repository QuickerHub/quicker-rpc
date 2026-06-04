import type { IconifyIcon } from "@iconify/types";
import bookAlphabet from "@iconify/icons-mdi/book-alphabet";
import calendar from "@iconify/icons-mdi/calendar";
import cubeOutline from "@iconify/icons-mdi/cube-outline";
import decimal from "@iconify/icons-mdi/decimal";
import fileDocumentOutline from "@iconify/icons-mdi/file-document-outline";
import formatFont from "@iconify/icons-mdi/format-font";
import formatListBulleted from "@iconify/icons-mdi/format-list-bulleted";
import formatListCheckbox from "@iconify/icons-mdi/format-list-checkbox";
import imageOutline from "@iconify/icons-mdi/image-outline";
import keyboard from "@iconify/icons-mdi/keyboard";
import layersOutline from "@iconify/icons-mdi/layers-outline";
import messageAlertOutline from "@iconify/icons-mdi/message-alert-outline";
import mouse from "@iconify/icons-mdi/mouse";
import numeric from "@iconify/icons-mdi/numeric";
import playCircleOutline from "@iconify/icons-mdi/play-circle-outline";
import table from "@iconify/icons-mdi/table";
import toggleSwitch from "@iconify/icons-mdi/toggle-switch";
import { resolveActionDesignerResIconRelativePath } from "./parseQuickerAssetIcon";

/** Offline Iconify glyphs for bundled `res:` paths (Var/*, Steps/*). */
export const RES_ICON_BUNDLED: Record<string, IconifyIcon> = {
  "mdi:book-alphabet": bookAlphabet,
  "mdi:calendar": calendar,
  "mdi:cube-outline": cubeOutline,
  "mdi:decimal": decimal,
  "mdi:file-document-outline": fileDocumentOutline,
  "mdi:format-font": formatFont,
  "mdi:format-list-bulleted": formatListBulleted,
  "mdi:format-list-checkbox": formatListCheckbox,
  "mdi:image-outline": imageOutline,
  "mdi:keyboard": keyboard,
  "mdi:layers-outline": layersOutline,
  "mdi:message-alert-outline": messageAlertOutline,
  "mdi:mouse": mouse,
  "mdi:numeric": numeric,
  "mdi:play-circle-outline": playCircleOutline,
  "mdi:table": table,
  "mdi:toggle-switch": toggleSwitch,
};

/**
 * Logical `res:` relative path (after alias + lowercase Var file names) → Iconify id.
 * Keys are lower-case, forward slashes.
 */
const RES_PATH_TO_ICONIFY = new Map<string, string>([
  ["var/text.png", "mdi:format-font"],
  ["var/number.png", "mdi:decimal"],
  ["var/boolean.png", "mdi:toggle-switch"],
  ["var/image.png", "mdi:image-outline"],
  ["var/list.png", "mdi:format-list-bulleted"],
  ["var/datetime.png", "mdi:calendar"],
  ["var/keyboard.png", "mdi:keyboard"],
  ["var/mouse.png", "mdi:mouse"],
  ["var/enum.png", "mdi:format-list-checkbox"],
  ["var/dict.png", "mdi:book-alphabet"],
  ["var/form.png", "mdi:file-document-outline"],
  ["var/file.png", "mdi:file-document-outline"],
  ["var/integer.png", "mdi:numeric"],
  ["var/table.png", "mdi:table"],
  ["var/formfordict.png", "mdi:file-document-outline"],
  ["var/object.png", "mdi:cube-outline"],
  ["var/any.png", "mdi:layers-outline"],
  ["steps/msgbox.png", "mdi:message-alert-outline"],
  ["steps/common_step.png", "mdi:play-circle-outline"],
]);

export function resolveResIconToIconifyId(logicalPath: string): string | null {
  const rel = resolveActionDesignerResIconRelativePath(logicalPath);
  const mapped = RES_PATH_TO_ICONIFY.get(rel.toLowerCase());
  if (mapped) return mapped;
  if (rel.toLowerCase().startsWith("steps/")) {
    return "mdi:play-circle-outline";
  }
  return null;
}

export function getResIconBundled(iconId: string): IconifyIcon | undefined {
  return RES_ICON_BUNDLED[iconId];
}

/** Render bundled Iconify icon as SVG string (for /api/icons/res fallback). */
export function iconifyIconToSvg(icon: IconifyIcon, size = 24): string {
  const body = typeof icon.body === "string" ? icon.body : "";
  const width = icon.width ?? 24;
  const height = icon.height ?? 24;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${size}" height="${size}">`,
    `<path d="${body}" fill="currentColor"/>`,
    `</svg>`,
  ].join("");
}

export function resolveResIconSvg(logicalPath: string, size = 24): string | null {
  const iconifyId = resolveResIconToIconifyId(logicalPath);
  if (!iconifyId) return null;
  const icon = getResIconBundled(iconifyId);
  if (!icon) return null;
  return iconifyIconToSvg(icon, size);
}

/** Safe relative path under ActionDesignerIcons (no traversal). */
export function normalizeResIconRequestPath(raw: string): string | null {
  const t = raw.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!t || t.includes("..")) return null;
  if (!/^[A-Za-z0-9_/.\-]+$/.test(t)) return null;
  return resolveActionDesignerResIconRelativePath(t);
}
