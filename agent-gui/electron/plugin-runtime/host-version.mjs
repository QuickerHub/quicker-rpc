import { readFileSync } from "node:fs";
import { join } from "node:path";

/** @param {string} resourcesRoot @param {import('electron').App} app */
export function hostVersion(resourcesRoot, app) {
  try {
    const raw = readFileSync(join(resourcesRoot, "app", "version.json"), "utf8");
    const data = JSON.parse(raw);
    const parts = String(data.QuickerRpc ?? "")
      .trim()
      .replace(/^v/, "")
      .split(".");
    if (parts.length >= 3) {
      return parts.slice(0, 3).join(".");
    }
  } catch {
    // fall through
  }
  return app.getVersion();
}
