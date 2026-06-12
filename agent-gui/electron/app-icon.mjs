import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nativeImage } from "./electron-api.mjs";

const electronRoot = dirname(fileURLToPath(import.meta.url));

/** @returns {string | null} */
export function resolveAppIconPath(isDev) {
  const packaged = join(dirname(process.execPath), "resources", "app-icon.ico");
  if (!isDev && existsSync(packaged)) {
    return packaged;
  }
  const devIcon = join(electronRoot, "..", "src-tauri", "icons", "icon.ico");
  if (existsSync(devIcon)) {
    return devIcon;
  }
  return null;
}

/** @returns {import('electron').NativeImage | undefined} */
export function createAppNativeIcon(isDev) {
  const iconPath = resolveAppIconPath(isDev);
  if (!iconPath) {
    return undefined;
  }
  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? undefined : image;
}
