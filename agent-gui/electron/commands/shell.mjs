import { realpathSync } from "node:fs";
import { dirname } from "node:path";
import { shell } from "../electron-api.mjs";
import {
  isRevealPathScope,
  resolvePathWithinRevealScope,
  revealInWindowsFileManager,
} from "../reveal-path.mjs";

function resolveExistingPath(resolved) {
  try {
    return realpathSync.native?.(resolved) ?? realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export function createShellCommands() {
  return {
    async reveal_path_in_file_manager(args) {
      const scope = args?.scope;
      const path = args?.path;
      if (!isRevealPathScope(scope)) {
        throw new Error("Invalid or missing scope");
      }
      if (typeof path !== "string" || !path.trim()) {
        throw new Error("Missing path");
      }
      const resolved = resolveExistingPath(
        resolvePathWithinRevealScope(scope, path, {
          mustExist: true,
        }),
      );

      if (process.platform === "win32") {
        revealInWindowsFileManager(resolved);
        return { ok: true, path: resolved, via: "electron", mode: "select" };
      }

      let mode = "select";
      let shown = shell.showItemInFolder(resolved);
      if (!shown) {
        const openError = await shell.openPath(dirname(resolved));
        if (openError) {
          throw new Error(openError);
        }
        mode = "folder";
      }

      return { ok: true, path: resolved, via: "electron", mode };
    },
  };
}
