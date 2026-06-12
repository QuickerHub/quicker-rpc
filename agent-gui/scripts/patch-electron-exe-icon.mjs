/**
 * Embed QuickerAgent icon into quicker-agent.exe after pack.
 * signAndEditExecutable stays false (avoids winCodeSign); rcedit npm sets resources only.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import rcedit from "rcedit";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {import("electron-builder").AfterPackContext} context
 */
export default async function patchElectronExeIcon(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const iconPath = join(agentGuiRoot, "src-tauri", "icons", "icon.ico");
  if (!existsSync(iconPath)) {
    throw new Error(`app icon missing: ${iconPath} (run pnpm electron:installer-assets)`);
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = join(context.appOutDir, exeName);
  if (!existsSync(exePath)) {
    throw new Error(`packed exe not found: ${exePath}`);
  }

  const appInfo = context.packager.appInfo;
  await rcedit(exePath, {
    icon: iconPath,
    "version-string": {
      ProductName: appInfo.productName,
      FileDescription: appInfo.description || appInfo.productName,
    },
    "file-version": appInfo.shortVersion || appInfo.buildVersion,
    "product-version":
      appInfo.shortVersionWindows || appInfo.getVersionInWeirdWindowsForm(),
  });

  console.log(`patch-electron-exe-icon: embedded icon into ${exeName}`);
}
